import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto } from 'src/dto/repository.dto';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { StorageCredentialService } from 'src/services/storageCredential.service';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly connection: ConnectionRepository,
    private readonly topology: TopologyRepository,
    private readonly storageCredentials: StorageCredentialService,
  ) {}

  async create(auth: AuthDto, { site: siteCode, ...dto }: RepositoryCreateRequestDto) {
    const site = this.topology.getSite(siteCode);
    const cluster = this.topology.getActiveCluster(site);

    let connectionId = auth.connectionId;
    if (!connectionId) {
      const connection = await this.connection.getOrCreateDefault(auth.id);
      connectionId = connection.id;
    }

    const repository = await this.repositoryRepository.create({
      userId: auth.id,
      connectionId,
      ...dto,
      siteCode: site.code,
      storageClusterCode: cluster.code,
    });

    // Eager, so a storage cluster that cannot issue an identity fails the
    // create rather than the first backup.
    await this.storageCredentials.ensure({
      id: repository.id,
      storageClusterCode: repository.storageClusterCode,
      storageAccessKeyId: null,
      storageSecretAccessKey: null,
    });

    return repository;
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

    const owner = await this.repositoryRepository.getStorageOwner(repository.id);
    const credentials = await this.storageCredentials.ensure(owner);

    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
      storageCluster: repository.storageClusterCode,
      connection: repository.connectionType,
      storageCredentials: this.storageCredentials.seal(repository.id, credentials),
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

    await this.storageCredentials.revoke(await this.repositoryRepository.getStorageOwner(id));
    await this.repositoryRepository.delete(id);
  }
}
