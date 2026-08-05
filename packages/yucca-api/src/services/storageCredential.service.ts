import { openStorageCredentials, sealStorageCredentials, StorageCredentials } from '@common/server';
import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RgwAdminRepository } from 'src/repositories/rgwAdmin.repository';
import { TopologyRepository, TopologyStorageCluster } from 'src/repositories/topology.repository';

export type StorageCredentialOwner = {
  id: string;
  storageClusterCode: string;
  storageAccessKeyId: string | null;
  storageSecretAccessKey: string | null;
};

export const storageUserId = (repositoryId: string) => `yucca-repo-${repositoryId}`;

@Injectable()
export class StorageCredentialService {
  constructor(
    private readonly rgw: RgwAdminRepository,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly topology: TopologyRepository,
  ) {}

  async ensure(repository: StorageCredentialOwner): Promise<StorageCredentials> {
    if (repository.storageSecretAccessKey) {
      return openStorageCredentials(env.STORAGE_CREDENTIAL_KEY, repository.id, repository.storageSecretAccessKey);
    }
    return this.provision(repository, (cluster) =>
      this.rgw.ensureUser(cluster, storageUserId(repository.id), `yucca repository ${repository.id}`),
    );
  }

  async rotate(repository: StorageCredentialOwner): Promise<StorageCredentials> {
    return this.provision(repository, (cluster) => this.rgw.rotateKeys(cluster, storageUserId(repository.id)));
  }

  async revoke(repository: StorageCredentialOwner): Promise<void> {
    const cluster = this.topology.getCluster(repository.storageClusterCode);
    if (this.rgw.supports(cluster)) {
      await this.rgw.revokeKeys(cluster, storageUserId(repository.id));
    }
    await this.repositoryRepository.setStorageCredentials(repository.id, {
      storageAccessKeyId: null,
      storageSecretAccessKey: null,
    });
  }

  seal(repositoryId: string, credentials: StorageCredentials): string {
    return sealStorageCredentials(env.STORAGE_CREDENTIAL_SEAL_KEY[0], repositoryId, credentials);
  }

  private async provision(
    repository: StorageCredentialOwner,
    issue: (cluster: TopologyStorageCluster) => Promise<StorageCredentials>,
  ): Promise<StorageCredentials> {
    const cluster = this.topology.getCluster(repository.storageClusterCode);
    const credentials = this.rgw.supports(cluster) ? await issue(cluster) : staticCredentials(cluster);

    await this.repositoryRepository.setStorageCredentials(repository.id, {
      storageAccessKeyId: credentials.accessKeyId,
      storageSecretAccessKey: sealStorageCredentials(env.STORAGE_CREDENTIAL_KEY[0], repository.id, credentials),
    });
    return credentials;
  }
}

const staticCredentials = (cluster: TopologyStorageCluster): StorageCredentials => {
  const accessKeyId = env.STORAGE_STATIC_ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_STATIC_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Storage cluster '${cluster.code}' has no rgw_admin_endpoint and no ` +
        `STORAGE_STATIC_ACCESS_KEY_ID/STORAGE_STATIC_SECRET_ACCESS_KEY to fall back to`,
    );
  }
  return { accessKeyId, secretAccessKey };
};
