import { LoggerRepository, MetricService } from '@common/server/otel';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Gauge } from '@opentelemetry/api';
import { AuthDto } from 'src/dto/auth.dto';
import {
  SubmitBackupEndRequestDto,
  SubmitStructuredLogRequestDto,
  SubmitUpdateSizeRequestDto,
} from 'src/dto/metrics.dto';
import { CursorPaginationDto } from 'src/dto/pagination.dto';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RepositoryMetricsRepository } from 'src/repositories/repositoryMetrics.repository';
import { RepositoryMetricsHistoryRepository } from 'src/repositories/repositoryMetricsHistory.repository';
import { resolveLimit } from 'src/utils/pagination';

const toUnixSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

@Injectable()
export class MetricsService {
  private readonly userRepositorySize: Gauge;
  private readonly userLastStarted: Gauge;
  private readonly userLastBackup: Gauge;
  private readonly userLastSuccessfulBackup: Gauge;
  private readonly userLastBackupDuration: Gauge;

  constructor(
    private readonly logger: LoggerRepository,
    private readonly repositories: RepositoryRepository,
    private readonly metrics: RepositoryMetricsRepository,
    private readonly history: RepositoryMetricsHistoryRepository,
    metricService: MetricService,
  ) {
    this.userRepositorySize = metricService.getGauge('user_repository_size', {
      description: 'Repository size in bytes',
    });
    this.userLastStarted = metricService.getGauge('user_last_started', {
      description: 'Unix timestamp of the last backup start',
    });
    this.userLastBackup = metricService.getGauge('user_last_backup', {
      description: 'Unix timestamp of the last backup attempt',
    });
    this.userLastSuccessfulBackup = metricService.getGauge('user_last_successful_backup', {
      description: 'Unix timestamp of the last successful backup',
    });
    this.userLastBackupDuration = metricService.getGauge('user_last_backup_duration', {
      description: 'Duration of the last backup in milliseconds',
    });
  }

  async submitBackupStart(auth: AuthDto, repositoryId: string) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    const now = new Date();
    await this.metrics.save(repositoryId, { lastStarted: now });
    await this.history.create({ repositoryId, started: now });

    this.userLastStarted.record(toUnixSeconds(now), { user_id: auth.id, repository_id: repositoryId });
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
    await this.history.create({
      repositoryId,
      backup: now,
      backupDuration: dto.durationMs,
      ...(dto.success ? { successfulBackup: now } : {}),
    });

    this.userLastBackup.record(toUnixSeconds(now), { user_id: auth.id, repository_id: repositoryId });
    this.userLastBackupDuration.record(dto.durationMs, { user_id: auth.id, repository_id: repositoryId });
    if (dto.success) {
      this.userLastSuccessfulBackup.record(toUnixSeconds(now), { user_id: auth.id, repository_id: repositoryId });
    }
  }

  async submitRepositorySize(auth: AuthDto, repositoryId: string, dto: SubmitUpdateSizeRequestDto) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    await this.metrics.save(repositoryId, { sizeBytes: dto.sizeBytes });
    await this.history.create({ repositoryId, sizeBytes: dto.sizeBytes });

    this.userRepositorySize.record(dto.sizeBytes, { user_id: auth.id, repository_id: repositoryId });
  }

  submitStructuredLog(auth: AuthDto, dto: SubmitStructuredLogRequestDto) {
    this.logger.info({
      _msg: `[telemetry] ${dto.summary}`,
      customerId: auth.id,
      data: dto.data,
    });
  }

  async listHistory(auth: AuthDto, repositoryId: string, query: CursorPaginationDto) {
    const repository = await this.repositories.get(repositoryId);
    if (repository.userId !== auth.id) {
      throw new UnauthorizedException();
    }

    return this.history.list({
      repositoryId,
      cursor: query.cursor,
      limit: resolveLimit(query.limit),
    });
  }
}
