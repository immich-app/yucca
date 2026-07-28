import { isRevocableConnectionType } from '@common/server';
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
import { ResticApiRepository } from 'src/repositories/resticApi.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly resticApi: ResticApiRepository,
    private readonly connection: ConnectionRepository,
    private readonly crypto: CryptoRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  async create(auth: AuthDto, dto: RepositoryCreateRequestDto) {
    const { connectionId: requestedConnectionId, ...values } = dto;

    // An explicit connectionId must be one the caller owns; otherwise sessions
    // bound to a connection (device-flow logins) own their repos, and web /
    // pre-connection sessions fall back to the default connection.
    let connectionId: string;
    if (requestedConnectionId) {
      const connection = await this.connection.getById(requestedConnectionId);
      if (!connection || connection.userId !== auth.id) {
        throw new UnauthorizedException();
      }
      connectionId = connection.id;
    } else if (auth.connectionId) {
      connectionId = auth.connectionId;
    } else {
      const defaultConnection = await this.connection.getOrCreateDefault(auth.id);
      connectionId = defaultConnection.id;
    }

    return this.repositoryRepository.create({ userId: auth.id, connectionId, ...values });
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

  // Mint a long-lived restic access URL for a repository. `expiresIn` defaults to
  // RESTIC_JWT_EXPIRES_IN and is capped at RESTIC_JWT_MAX_EXPIRES_IN; `label` is a
  // human tag shown in the token list. Returns the rest: URL, jti, and expiry.
  async createUrl(auth: AuthDto, id: string, opts: ResticUrlRequestDto = {}) {
    const repository = await this.get(auth, id);

    const expiresIn = this.resolveExpiresIn(opts.expiresIn);

    const jti = this.crypto.randomUUID();
    const token = await this.jwt.signAsync(
      {
        user: auth.id,
        repository: repository.id,
        writeOnce: repository.worm,
        jti,
        connection: repository.connectionType,
      },
      { expiresIn },
    );

    // Track every minted token: the audit of live credentials and the basis
    // for revocation. expiresAt comes from the token itself, not re-derived.
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

    // Only revocable connection types (restic) carry a Redis validity marker;
    // michael skips the check for the rest, so writing one would be dead weight.
    if (isRevocableConnectionType(repository.connectionType)) {
      await this.revocation.markValid(jti, expiresAt);
    }

    this.wideContext.addContext('repositoryId', repository.id);

    const url = this.resticApi.getEndpoint();
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}`, jti, expiresAt };
  }

  private resolveExpiresIn(requested?: string): StringValue {
    if (!requested) {
      return env.RESTIC_JWT_EXPIRES_IN;
    }
    const requestedMs = ms(requested as StringValue);
    const cap = ms(env.RESTIC_JWT_MAX_EXPIRES_IN);
    if (!requestedMs || requestedMs <= 0) {
      throw new BadRequestException(`Invalid expiresIn '${requested}'`);
    }
    if (requestedMs > cap) {
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

    await this.repositoryRepository.delete(id);
  }
}
