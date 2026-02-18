import { getAuth } from 'yucca-api-client';
import { BackendType } from '../enum';
import { ModuleConfig } from '../moduleConfig';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class YuccaBackend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Yucca }) {
    super(configuration);
  }

  async online(moduleConfig: ModuleConfig): Promise<boolean> {
    try {
      await getAuth({
        baseUrl: this.configuration.url ?? moduleConfig.yuccaProductionApi,
        headers: {
          cookie: `access-token=${this.configuration.accessToken}`,
        },
      });

      return true;
    } catch {
      return false;
    }
  }
}
