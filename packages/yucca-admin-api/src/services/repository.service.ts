import { isRevocableConnectionType } from '@common/server';
import { BadRequestException, Injectable, InternalServerErrorException, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import ms, { StringValue } from 'ms';
import { randomUUID } from 'node:crypto';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryUrlRequestDto,
  RepositoryUrlResponseDto,
} from 'src/dto/repository.dto';
import { env } from 'src/env';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { resolveLimit } from 'src/utils/pagination';

const serviceUser = {
  sub: 'yucca-admin-service',
  name: 'Admin service',
  email: 'admin-service@yucca.invalid',
};

@Injectable()
export class RepositoryService {
  constructor(
    private readonly repositories: RepositoryRepository,
    private readonly users: UserRepository,
    private readonly connections: ConnectionRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly jwt: JwtService,
    private readonly topology: TopologyRepository,
  ) {}

  list(query: RepositoryListQueryDto): Promise<RepositoryListResponseDto> {
    return this.repositories.list({
      cursor: query.cursor,
      limit: resolveLimit(query.limit),
      userId: query.userId,
    });
  }

  async get(id: string): Promise<RepositoryGetResponseDto> {
    return { repository: await this.repositories.get(id) };
  }

  async create(dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    const site = this.topology.getSite(dto.site);
    const cluster = this.topology.getActiveCluster(site);

    let userId = dto.userId;
    let connection: { type: string; name: string };
    if (userId) {
      const type = dto.connectionType ?? 'restic';
      const names: Record<string, string> = { restic: 'Manual restic', immich: 'Immich' };
      connection = { type, name: names[type] ?? type };
    } else {
      const user = (await this.users.getBySub(serviceUser.sub)) ?? (await this.users.create(serviceUser));
      userId = user.id;
      connection = { type: 'restic', name: 'admin' };
    }
    const { id: connectionId } = await this.connections.getOrCreateByType(userId, connection.type, connection.name);
    const repository = await this.repositories.create({
      name: dto.name,
      userId,
      connectionId,
      worm: dto.worm ?? false,
      siteCode: site.code,
      storageClusterCode: cluster.code,
    });
    return { repository };
  }

  async url(id: string, dto: RepositoryUrlRequestDto = {}): Promise<RepositoryUrlResponseDto> {
    if (!env.RESTIC_JWT_PRIVATE_KEY) {
      throw new NotImplementedException('RESTIC_JWT_PRIVATE_KEY is not configured');
    }
    const repository = await this.repositories.get(id);
    const site = this.topology.getSite(repository.siteCode);

    if (dto.expiresIn && !isRevocableConnectionType(repository.connectionType)) {
      throw new BadRequestException(
        `Custom expiresIn requires a revocable connection type; ${repository.connectionType} tokens cannot be revoked`,
      );
    }

    let expiresIn = env.RESTIC_JWT_EXPIRES_IN;
    if (dto.expiresIn) {
      if (ms(dto.expiresIn as StringValue) > ms(env.RESTIC_JWT_MAX_EXPIRES_IN)) {
        throw new BadRequestException(`expiresIn exceeds the ${env.RESTIC_JWT_MAX_EXPIRES_IN} cap`);
      }
      expiresIn = dto.expiresIn as StringValue;
    }

    const jti = randomUUID();
    const token = await this.jwt.signAsync(
      {
        user: repository.user.id,
        repository: repository.id,
        writeOnce: repository.worm,
        storageCluster: repository.storageClusterCode,
        jti,
        connection: repository.connectionType,
      },
      { privateKey: env.RESTIC_JWT_PRIVATE_KEY, algorithm: 'ES256', expiresIn },
    );

    const { exp } = this.jwt.decode<{ exp: number }>(token);
    const expiresAt = new Date(exp * 1000);
    await this.resticTokens.create({
      jti,
      repositoryId: repository.id,
      userId: repository.user.id,
      connectionId: repository.connectionId,
      mintedBy: 'admin',
      label: dto.label ?? null,
      expiresAt,
    });

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}`, jti, expiresAt };
  }

  async update(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return { repository: await this.repositories.update(id, dto) };
  }

  async delete(id: string): Promise<void> {
    throw new InternalServerErrorException('unimplemented - must talk to S3');
    await this.repositories.delete(id);
  }
}
