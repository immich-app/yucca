import { Injectable, InternalServerErrorException, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryUrlResponseDto,
} from 'src/dto/repository.dto';
import { env } from 'src/env';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { resolveLimit } from 'src/utils/pagination';

// Owner of admin-created repositories when no userId is given (e.g. yuctl
// bench repos). A plain DB row — it can never log in (the sub is not a real
// OIDC subject).
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
    if (!userId) {
      const user = (await this.users.getBySub(serviceUser.sub)) ?? (await this.users.create(serviceUser));
      userId = user.id;
    }
    const repository = await this.repositories.create({
      name: dto.name,
      userId,
      worm: dto.worm ?? false,
      siteCode: site.code,
      storageClusterCode: cluster.code,
    });
    return { repository };
  }

  // Mirrors yucca-api's createUrl: a restic rest: URL with an embedded JWT
  // that michael verifies against yucca-api's public key.
  async url(id: string): Promise<RepositoryUrlResponseDto> {
    if (!env.RESTIC_JWT_PRIVATE_KEY) {
      throw new NotImplementedException('RESTIC_JWT_PRIVATE_KEY is not configured');
    }
    const repository = await this.repositories.get(id);
    const site = this.topology.getSite(repository.siteCode);
    const token = await this.jwt.signAsync(
      {
        user: repository.user.id,
        repository: repository.id,
        writeOnce: repository.worm,
        storageCluster: repository.storageClusterCode,
      },
      { privateKey: env.RESTIC_JWT_PRIVATE_KEY, algorithm: 'ES256', expiresIn: env.RESTIC_JWT_EXPIRES_IN },
    );

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
  }

  async update(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return { repository: await this.repositories.update(id, dto) };
  }

  async delete(id: string): Promise<void> {
    throw new InternalServerErrorException('unimplemented - must talk to S3');
    await this.repositories.delete(id);
  }
}
