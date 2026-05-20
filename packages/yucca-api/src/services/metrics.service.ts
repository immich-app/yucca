import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { SubmitBackupEndRequestDto, SubmitUpdateSizeRequestDto } from 'src/dto/metrics.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RepositoryMetricsRepository } from 'src/repositories/repositoryMetrics.repository';

@Injectable()
export class MetricsService {
  constructor(
    private readonly repositories: RepositoryRepository,
    private readonly metrics: RepositoryMetricsRepository,
  ) {}

  async submitBackupStart(auth: AuthDto, repositoryId: string) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    await this.metrics.save(repositoryId, {
      lastStarted: new Date(),
    });
  }

  async submitBackupEnd(auth: AuthDto, repositoryId: string, dto: SubmitBackupEndRequestDto) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    const now = new Date();
    await this.metrics.save(repositoryId, {
      lastBackup: now,
      lastBackupDuration: dto.durationMs,
      ...(dto.success ? { lastSuccessfulBackup: now } : {}),
    });
  }

  async submitRepositorySize(auth: AuthDto, repositoryId: string, dto: SubmitUpdateSizeRequestDto) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    await this.metrics.save(repositoryId, { sizeBytes: dto.sizeBytes });
  }
}
