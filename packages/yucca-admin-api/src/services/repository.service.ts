import { Injectable, InternalServerErrorException, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryStorageCredentialsRequestDto,
  RepositoryStorageCredentialsResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryUrlResponseDto,
} from 'src/dto/repository.dto';
import { env } from 'src/env';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { StorageCredentialService, storageUserId } from 'src/services/storageCredential.service';
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
    private readonly jwt: JwtService,
    private readonly topology: TopologyRepository,
    private readonly storageCredentials: StorageCredentialService,
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
    await this.storageCredentials.ensure({
      id: repository.id,
      storageClusterCode: repository.storageClusterCode,
      storageAccessKeyId: null,
      storageSecretAccessKey: null,
    });
    return { repository };
  }

  async url(id: string): Promise<RepositoryUrlResponseDto> {
    if (!env.RESTIC_JWT_PRIVATE_KEY) {
      throw new NotImplementedException('RESTIC_JWT_PRIVATE_KEY is not configured');
    }
    const repository = await this.repositories.get(id);
    const site = this.topology.getSite(repository.siteCode);
    const credentials = await this.storageCredentials.ensure(await this.repositories.getStorageOwner(id));
    const token = await this.jwt.signAsync(
      {
        user: repository.user.id,
        repository: repository.id,
        writeOnce: repository.worm,
        storageCluster: repository.storageClusterCode,
        connection: repository.connectionType,
        storageCredentials: this.storageCredentials.seal(repository.id, credentials),
      },
      { privateKey: env.RESTIC_JWT_PRIVATE_KEY, algorithm: 'ES256', expiresIn: env.RESTIC_JWT_EXPIRES_IN },
    );

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
  }

  // Drives `yuctl repos migrate-storage-credentials`.
  async provisionStorageCredentials(
    id: string,
    dto: RepositoryStorageCredentialsRequestDto,
  ): Promise<RepositoryStorageCredentialsResponseDto> {
    const owner = await this.repositories.getStorageOwner(id);
    const credentials = dto.rotate
      ? await this.storageCredentials.rotate(owner)
      : await this.storageCredentials.ensure(owner);
    return {
      storageUserId: storageUserId(id),
      storageClusterCode: owner.storageClusterCode,
      accessKeyId: credentials.accessKeyId,
    };
  }

  async update(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return { repository: await this.repositories.update(id, dto) };
  }

  async delete(id: string): Promise<void> {
    throw new InternalServerErrorException('unimplemented - must talk to S3');
    await this.repositories.delete(id);
  }
}
