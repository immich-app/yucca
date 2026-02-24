import { BackendTable } from './tables/backend.table';
import { ConfigTable } from './tables/config.table';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryPathTable } from './tables/repositoryPath.table';

export interface DB {
  backends: BackendTable;
  config: ConfigTable;
  repositories: RepositoryTable;
  repositoryPaths: RepositoryPathTable;
}
