import { WideContextRepository } from '@common/server/otel';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto } from 'src/dto/repository.dto';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly connection: ConnectionRepository,
    private readonly topology: TopologyRepository,
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
    return this.getOwned(auth.id, id);
  }

  private async getOwned(userId: string, id: string) {
    const repository = await this.repositoryRepository.get(id);
    if (repository.userId !== userId) {
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
      throw new BadRequestException('Refusing to disable write-only on repository, use DELETE /repository/:id/worm');
    }

    return { repository: await this.repositoryRepository.update(id, dto) };
  }

  async disableWorm(userId: string, id: string) {
    const repository = await this.getOwned(userId, id);
    if (!repository.worm) {
      throw new BadRequestException('Repository is not write-only');
    }

    return { repository: await this.repositoryRepository.update(id, { worm: false }) };
  }

  async createUrl(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);

    const site = this.topology.getSite(repository.siteCode);

    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
      storageCluster: repository.storageClusterCode,
      connection: repository.connectionType,
    });

    this.wideContext.addContext('repositoryId', repository.id);

    const url = new URL(site.rest_url);
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
  }

  async delete(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.repositoryRepository.delete(id);
  }
}
