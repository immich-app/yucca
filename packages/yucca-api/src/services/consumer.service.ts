import { BadRequestException, Injectable, NotFoundException, Scope, UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import {
  ConsumerAdoptRequestDto,
  ConsumerCreateRequestDto,
  ConsumerListResponseDto,
  ConsumerUpdateRequestDto,
} from 'src/dto/consumer.dto';
import { ConsumerRepository } from 'src/repositories/consumer.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';

@Injectable({ scope: Scope.REQUEST })
export class ConsumerService {
  constructor(
    private readonly consumers: ConsumerRepository,
    private readonly repositories: RepositoryRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  async list(auth: AuthDto): Promise<ConsumerListResponseDto> {
    const rows = await this.consumers.getByUserWithRepositoryCounts(auth.id);
    return {
      consumers: rows.map((row) => ({ ...row, repositoryCount: Number(row.repositoryCount ?? 0) })),
    };
  }

  private async getOwned(auth: AuthDto, id: string) {
    const consumer = await this.consumers.getById(id);
    if (!consumer) {
      throw new NotFoundException(`No consumer with id ${id}`);
    }
    if (consumer.userId !== auth.id) {
      throw new UnauthorizedException();
    }
    return consumer;
  }

  create(auth: AuthDto, dto: ConsumerCreateRequestDto) {
    return this.consumers.create({ userId: auth.id, type: dto.type, name: dto.name });
  }

  async update(auth: AuthDto, id: string, dto: ConsumerUpdateRequestDto) {
    await this.getOwned(auth, id);
    return this.consumers.update(id, { name: dto.name });
  }

  // Deleting a consumer kills its sessions (FK cascade) and revokes its
  // outstanding restic tokens; its repositories must be adopted or deleted
  // first (FK RESTRICT backs the check).
  async delete(auth: AuthDto, id: string) {
    const consumer = await this.getOwned(auth, id);

    const defaultConsumer = await this.consumers.getOrCreateDefault(auth.id);
    if (consumer.id === defaultConsumer.id) {
      throw new BadRequestException('Refusing to delete the default consumer');
    }

    const repositories = await this.consumers.getByUserWithRepositoryCounts(auth.id);
    const withCount = repositories.find((row) => row.id === id);
    if (Number(withCount?.repositoryCount ?? 0) > 0) {
      throw new BadRequestException('Consumer still owns repositories; adopt or delete them first');
    }

    const active = await this.resticTokens.getActiveByConsumer(id);
    for (const token of active) {
      await this.resticTokens.revoke(token.jti, `consumer-delete:${auth.id}`);
      await this.revocation.markRevoked(token.jti, token.expiresAt);
    }

    await this.consumers.delete(id);
  }

  // Client-driven instance attribution: a consumer claims repositories that
  // currently sit on the user's default consumer (the backfill bucket).
  async adopt(auth: AuthDto, id: string, dto: ConsumerAdoptRequestDto) {
    const target = await this.getOwned(auth, id);
    const defaultConsumer = await this.consumers.getOrCreateDefault(auth.id);

    const repositories = await this.repositories.getByIds(dto.repositoryIds);
    if (repositories.length !== dto.repositoryIds.length) {
      throw new NotFoundException('One or more repositories do not exist');
    }
    for (const repository of repositories) {
      if (repository.userId !== auth.id) {
        throw new UnauthorizedException();
      }
      if (repository.consumerId === target.id) {
        continue;
      }
      if (repository.consumerId !== defaultConsumer.id) {
        throw new BadRequestException(
          `Repository ${repository.id} belongs to another consumer; only default-consumer repositories can be adopted`,
        );
      }
    }

    await this.repositories.reparent(dto.repositoryIds, target.id);
  }
}
