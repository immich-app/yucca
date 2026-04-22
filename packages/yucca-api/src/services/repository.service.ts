import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
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

  create(auth: AuthDto, dto: RepositoryCreateRequestDto) {
    return this.repositoryRepository.create({ userId: auth.id, ...dto });
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

  async delete(auth: AuthDto, id: string) {
    const repository = await this.get(auth, id);
    if (repository.worm) {
      throw new BadRequestException('Refusing to delete write-only repository');
    }

    await this.repositoryRepository.delete(id);
  }
}
