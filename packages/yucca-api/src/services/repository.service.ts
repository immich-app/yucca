import { connectionTypeFlag, isRevocableConnectionType } from '@common/server';
import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import ms, { StringValue } from 'ms';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto, ResticUrlRequestDto } from 'src/dto/repository.dto';
import { env } from 'src/env';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { FeatureNotEnabledException } from 'src/utils/exceptions';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly connection: ConnectionRepository,
    private readonly topology: TopologyRepository,
    private readonly crypto: CryptoRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  private requireTypeFlag(auth: AuthDto, connectionType: string) {
    const flag = connectionTypeFlag(connectionType);
    if (flag && !auth.features[flag]) {
      throw new FeatureNotEnabledException(flag);
    }
  }

  async create(auth: AuthDto, { site: siteCode, ...dto }: RepositoryCreateRequestDto) {
    const site = this.topology.getSite(siteCode);
    const cluster = this.topology.getActiveCluster(site);

    const { connectionId: requestedConnectionId, ...values } = dto;

    let connection: { id: string; type: string };
    if (requestedConnectionId) {
      const owned = await this.connection.getById(requestedConnectionId);
      if (!owned || owned.userId !== auth.id) {
        throw new UnauthorizedException();
      }
      connection = owned;
    } else if (auth.connectionId) {
      const bound = await this.connection.getById(auth.connectionId);
      if (!bound) {
        throw new UnauthorizedException();
      }
      connection = bound;
    } else {
      connection = await this.connection.getOrCreateDefault(auth.id);
    }
    this.requireTypeFlag(auth, connection.type);

    return this.repositoryRepository.create({
      userId: auth.id,
      connectionId: connection.id,
      ...values,
      siteCode: site.code,
      storageClusterCode: cluster.code,
    });
  }

  async get(auth: AuthDto, id: string) {
    const repository = await this.repositoryRepository.get(id);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    return repository;
  }

  async getAll(auth: AuthDto) {
    return { repositories: await this.repositoryRepository.getByUser(auth.id) };
  }

  async update(auth: AuthDto, id: string, dto: RepositoryUpdateRequestDto) {
    const repository = await this.get(auth, id);

    if (repository.worm && typeof dto.worm === 'boolean' && dto.worm !== repository.worm) {
      throw new BadRequestException('Refusing to disable write-only on repository');
    }

    return { repository: await this.repositoryRepository.update(id, dto) };
  }

  async createUrl(auth: AuthDto, id: string, opts: ResticUrlRequestDto = {}) {
    const repository = await this.get(auth, id);
    this.requireTypeFlag(auth, repository.connectionType);

    const revocable = isRevocableConnectionType(repository.connectionType);
    if (!revocable && opts.expiresIn) {
      throw new BadRequestException(
        `Custom expiresIn requires a revocable connection type; ${repository.connectionType} tokens cannot be revoked`,
      );
    }
    const expiresIn = revocable ? this.resolveExpiresIn(opts.expiresIn) : env.JWT_EXPIRES_IN;

    const site = this.topology.getSite(repository.siteCode);
    const jti = this.crypto.randomUUID();
    const token = await this.jwt.signAsync(
      {
        user: auth.id,
        repository: repository.id,
        writeOnce: repository.worm,
        storageCluster: repository.storageClusterCode,
        jti,
        connection: repository.connectionType,
      },
      { expiresIn },
    );

    const { exp } = this.jwt.decode<{ exp: number }>(token);
    const expiresAt = new Date(exp * 1000);
    await this.resticTokens.create({
      jti,
      repositoryId: repository.id,
      userId: auth.id,
      connectionId: repository.connectionId,
      mintedBy: 'user',
      label: opts.label ?? null,
      expiresAt,
    });

    this.wideContext.addContext('repositoryId', repository.id);

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}`, jti, expiresAt };
  }

  private resolveExpiresIn(requested?: string): StringValue {
    if (!requested) {
      return env.RESTIC_JWT_EXPIRES_IN;
    }
    if (ms(requested as StringValue) > ms(env.RESTIC_JWT_MAX_EXPIRES_IN)) {
      throw new BadRequestException(`expiresIn exceeds the ${env.RESTIC_JWT_MAX_EXPIRES_IN} cap`);
    }
    return requested as StringValue;
  }

  async listResticTokens(auth: AuthDto, id: string) {
    await this.get(auth, id); // owner check
    return { tokens: await this.resticTokens.getByRepository(id) };
  }

  async delete(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);
    if (repository.worm) {
      throw new BadRequestException('Refusing to delete write-only repository');
    }

    const active = await this.resticTokens.getActiveByRepository(id);
    await this.repositoryRepository.delete(id);
    for (const token of active) {
      await this.revocation.invalidateVerdict(token.jti);
    }
  }
}
