import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ColumboInvestigateRequestDto, ColumboInvestigationDto } from 'src/dto/columbo.dto';
import { ColumboJob, ColumboRepository } from 'src/repositories/columbo.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class ColumboService {
  constructor(
    private readonly columbo: ColumboRepository,
    private readonly users: UserRepository,
  ) {}

  async startInvestigation(dto: ColumboInvestigateRequestDto): Promise<ColumboInvestigationDto> {
    if (!this.columbo.enabled) {
      throw new NotImplementedException('COLUMBO_URL is not configured');
    }
    await this.users.get(dto.userId).catch(() => {
      throw new NotFoundException(`No user with id ${dto.userId}`);
    });
    const id = await this.columbo.startInvestigation(dto.userId, dto.prompt);
    return {
      id,
      status: 'running',
      note: null,
      queries: [],
      error: null,
      toolCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  async getInvestigation(id: string): Promise<ColumboInvestigationDto> {
    if (!this.columbo.enabled) {
      throw new NotImplementedException('COLUMBO_URL is not configured');
    }
    const job = await this.columbo.getInvestigation(id);
    if (!job) {
      throw new NotFoundException(`No investigation with id ${id}`);
    }
    return this.toDto(job);
  }

  private toDto(job: ColumboJob): ColumboInvestigationDto {
    return {
      id: job.id,
      status: job.status,
      note: job.note ?? null,
      queries: job.queries ?? [],
      error: job.error ?? null,
      toolCalls: job.toolCalls ?? 0,
      promptTokens: job.promptTokens ?? 0,
      completionTokens: job.completionTokens ?? 0,
    };
  }
}
