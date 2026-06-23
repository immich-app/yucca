/* eslint-disable @typescript-eslint/require-await */

import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from '@futo-org/backups-api-client';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class S3Backend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.S3 }) {
    super(configuration);
  }

  isBackupCapable(): boolean {
    return true;
  }

  isMetricsCapable(): boolean {
    return false;
  }

  async checkOnline(): Promise<void> {}

  createRepository(_dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    throw new Error('Method not implemented.');
  }

  updateRepository(_id: string, _dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    throw new Error('Method not implemented.');
  }

  getRepository(_id: string): Promise<RepositoryGetResponseDto> {
    throw new Error('Method not implemented.');
  }

  getRepositories(): Promise<RepositoryListResponseDto> {
    throw new Error('Method not implemented.');
  }

  async deleteRepository(_id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getResticEndpoint(id: string): Promise<string> {
    // TODO: requires additional auth parameters for restic
    return `s3:${this.configuration.endpoint}/${id}`;
  }

  submitMetricBackupStart(): Promise<void> {
    throw new Error('not capable');
  }

  submitMetricBackupEnd(): Promise<void> {
    throw new Error('not capable');
  }

  submitMetricRepositorySize(): Promise<void> {
    throw new Error('not capable');
  }

  submitStructuredLog(): void {
    throw new Error('not capable');
  }
}
