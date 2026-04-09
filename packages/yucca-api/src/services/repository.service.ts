import { WideContextRepository } from '@common/server/otel';
import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto, RepositoryUpdateRequestDto } from 'src/dto/repository.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticApiRepository } from 'src/repositories/resticApi.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
    private readonly resticApi: ResticApiRepository,
  ) {}

  async create(auth: AuthDto, dto: RepositoryCreateRequestDto) {
    return {
      ...(await this.repositoryRepository.create({
        userId: auth.id,
        ...dto,
      })),
      metrics: {
        lastBackup: null,
        lastSuccessfulBackup: null,
        sizeBytes: 0,
      },
    };
  }

  async get(id: string) {
    return {
      ...(await this.repositoryRepository.get(id)),
      metrics: {
        lastBackup: null,
        lastSuccessfulBackup: null,
        sizeBytes: 0,
      },
    };
  }

  async getAll(auth: AuthDto) {
    const repositories = await this.repositoryRepository.getByUser(auth.id);

    return {
      repositories: repositories.map((repository) => ({
        ...repository,
        metrics: {
          lastBackup: null,
          lastSuccessfulBackup: null,
          sizeBytes: 0,
        },
      })),
    };
  }

  async update(id: string, dto: RepositoryUpdateRequestDto) {
    return {
      repository: {
        ...(await this.repositoryRepository.update(id, dto)),
        metrics: {
          lastBackup: null,
          lastSuccessfulBackup: null,
          sizeBytes: 0,
        },
      },
    };
  }

  async createUrl(auth: AuthDto, id: string) {
    const repository = await this.repositoryRepository.get(id);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
    });

    this.wideContext.addContext('repositoryId', repository.id);

    const url = this.resticApi.getEndpoint();
    url.username = 'restic';
    url.password = token;
    url.pathname = repository.id;

    return { url: `rest:${url.href}` };
  }
}
