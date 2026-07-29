import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto } from 'src/dto/repository.dto';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';

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

  async create(auth: AuthDto, { site: siteCode, ...dto }: RepositoryCreateRequestDto) {
    const site = this.topology.getSite(siteCode);
    const cluster = this.topology.getActiveCluster(site);

    let connectionId = auth.connectionId;
    if (!connectionId) {
      const connection = await this.connection.getOrCreateDefault(auth.id);
      connectionId = connection.id;
    }

    return this.repositoryRepository.create({
      userId: auth.id,
      connectionId,
      ...dto,
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

  async createUrl(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);

    const site = this.topology.getSite(repository.siteCode);
    const jti = this.crypto.randomUUID();
    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
      storageCluster: repository.storageClusterCode,
      jti,
      connection: repository.connectionType,
    });

    const { exp } = this.jwt.decode<{ exp: number }>(token);
    await this.resticTokens.create({
      jti,
      repositoryId: repository.id,
      userId: auth.id,
      connectionId: repository.connectionId,
      mintedBy: 'user',
      expiresAt: new Date(exp * 1000),
    });

    this.wideContext.addContext('repositoryId', repository.id);

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
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
