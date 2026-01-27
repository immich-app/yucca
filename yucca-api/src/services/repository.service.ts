import env from '@common/server/env';
import { WideContextRepository } from '@common/server/otel';
import { Injectable, Scope } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';

@Injectable({ scope: Scope.REQUEST })
export class RepositoryService {
  constructor(
    private readonly jwt: JwtService,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async create(auth: AuthDto, worm: boolean) {
    return {
      repository: await this.repositoryRepository.create({
        userId: auth.id,
        worm,
      }),
    };
  }

  async get(id: string) {
    return await this.repositoryRepository.get(id);
  }

  async getAll(auth: AuthDto) {
    return {
      repositories: await this.repositoryRepository.getByUser(auth.id),
    };
  }

  async createUrl(auth: AuthDto, repository: { id: string; worm: boolean }) {
    const token = await this.jwt.signAsync({
      user: auth.id,
      repository: repository.id,
      writeOnce: repository.worm,
    });

    this.wideContext.addContext('repositoryId', repository.id);
    return { url: `rest:http://restic:${token}@localhost:${env.RESTIC_API_PORT}/${repository.id}/` };
  }
}
