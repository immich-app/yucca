/* eslint-disable @typescript-eslint/require-await */

import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from 'yucca-api-client';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class S3Backend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.S3 }) {
    super(configuration);
  }

  async checkOnline(): Promise<void> {}

  createRepository(_dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    throw new Error('Method not implemented.');
  }

  updateRepository(_id: string, _dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    throw new Error('Method not implemented.');
  }

  getRepositories(): Promise<RepositoryListResponseDto> {
    throw new Error('Method not implemented.');
  }

  async getResticEndpoint(id: string): Promise<string> {
    // TODO: requires additional auth parameters for restic
    return `s3:${this.configuration.endpoint}/${id}`;
  }
}
