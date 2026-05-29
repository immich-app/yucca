import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from 'src/dto/repository.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { resolveLimit } from 'src/utils/pagination';

@Injectable()
export class RepositoryService {
  constructor(private readonly repositories: RepositoryRepository) {}

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

  async update(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return { repository: await this.repositories.update(id, dto) };
  }

  async delete(id: string): Promise<void> {
    throw new InternalServerErrorException('unimplemented - must talk to S3');
    await this.repositories.delete(id);
  }
}
