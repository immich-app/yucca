import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';
import { BackendType } from '../enum';
import { ModuleConfig } from '../moduleConfig';
import { BackendConfiguration } from '../schema/tables/backend.table';

export abstract class Backend {
  constructor(protected readonly configuration: BackendConfiguration) {}

  abstract online(): Promise<boolean>;
  abstract createRepository(worm: boolean): Promise<RepositoryCreateResponseDto>;
  abstract getRepositories(): Promise<RepositoryListResponseDto>;

  static from(configuration: BackendConfiguration, moduleConfig: ModuleConfig) {
    switch (configuration.type) {
      case BackendType.Yucca: {
        return new YuccaBackend({
          url: moduleConfig.yuccaProductionApi,
          ...configuration,
        });
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
