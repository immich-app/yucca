import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  TicketCreateRequestDto,
  TicketCreateResponseDto,
} from '@futo-org/backups-api-client';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';

export abstract class Backend {
  constructor(protected readonly configuration: BackendConfiguration) {}

  abstract isBackupCapable(): boolean;
  abstract isMetricsCapable(): boolean;

  abstract checkOnline(): Promise<void>;
  abstract createRepository(dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto>;
  abstract updateRepository(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto>;
  abstract getRepository(id: string): Promise<RepositoryGetResponseDto>;
  abstract getRepositories(): Promise<RepositoryListResponseDto>;
  abstract deleteRepository(id: string): Promise<void>;
  abstract createTicket(dto: TicketCreateRequestDto): Promise<TicketCreateResponseDto>;

  abstract getResticEndpoint(id: string): Promise<string>;

  abstract submitMetricBackupStart(id: string): void;
  abstract submitMetricBackupEnd(id: string, success: boolean, duration: number): void;
  abstract submitMetricRepositorySize(id: string, size: number): void;
  abstract submitStructuredLog(summary: string, data: object): void;

  static from(configuration: BackendConfiguration) {
    switch (configuration.type) {
      case BackendType.Yucca: {
        return new YuccaBackend(configuration);
      }
      case BackendType.Local: {
        return new LocalBackend(configuration);
      }
      case BackendType.S3: {
        return new S3Backend(configuration);
      }
    }
  }
}

import { LocalBackend } from './local.backend';
import { S3Backend } from './s3.backend';
import { YuccaBackend } from './yucca.backend';
