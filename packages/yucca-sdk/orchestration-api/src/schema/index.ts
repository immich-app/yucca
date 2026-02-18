import { BackendTable } from './tables/backend.table';
import { ConfigTable } from './tables/config.table';
import { RepositoryTable } from './tables/repository.table';

export interface DB {
  backends: BackendTable;
  config: ConfigTable;
  repositories: RepositoryTable;
}
