import { env } from '@common/server/env';
import { WideContextRepository } from '@common/server/otel';
import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryCreateRequestDto } from 'src/dto/repository.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async create(auth: AuthDto, dto: RepositoryCreateRequestDto) {
    return {
      repository: {
        ...(await this.repositoryRepository.create({
          userId: auth.id,
          ...dto,
        })),
        metrics: {
          lastBackup: null,
          sizeBytes: 0,
        },
      },
    };
  }

  async get(id: string) {
    return await this.repositoryRepository.get(id);
  }

  async getAll(auth: AuthDto) {
    const repositories = await this.repositoryRepository.getByUser(auth.id);

    return {
      repositories: repositories.map((repository) => ({
        ...repository,
        metrics: {
          lastBackup: null,
          sizeBytes: 0,
        },
      })),
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
    return { url: `rest:http://restic:${token}@localhost:${env.RESTIC_API_PORT}/${repository.id}/` };
  }
}
