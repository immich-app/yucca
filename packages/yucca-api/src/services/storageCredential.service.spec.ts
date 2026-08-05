import { openStorageCredentials } from '@common/server';
import { env } from 'src/env';
import { StorageCredentialService, storageUserId } from 'src/services/storageCredential.service';
import { Mocks, newMocks } from '../../test/mocks';

const repoId = 'e2b47875-91a9-4c67-a3cd-fd6c0a5b6d11';

const cluster = { code: 'father-spice', display_name: 'Spice', active: true, rgw_admin_endpoint: 'https://rgw.test' };

const unprovisioned = {
  id: repoId,
  storageClusterCode: 'father-spice',
  storageAccessKeyId: null,
  storageSecretAccessKey: null,
};

const credentials = { accessKeyId: 'AKIAREPO', secretAccessKey: 's3cret' };

describe(StorageCredentialService.name, () => {
  let sut: StorageCredentialService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    mocks.topology.getCluster.mockReturnValue(cluster);
    sut = new StorageCredentialService(mocks.rgwAdmin as never, mocks.repository as never, mocks.topology as never);
  });

  describe('ensure', () => {
    it('creates the repository RGW user and stores the keys sealed', async () => {
      mocks.rgwAdmin.ensureUser.mockResolvedValue(credentials);

      await expect(sut.ensure(unprovisioned)).resolves.toEqual(credentials);

      expect(mocks.rgwAdmin.ensureUser).toHaveBeenCalledWith(cluster, storageUserId(repoId), expect.any(String));

      const [, stored] = mocks.repository.setStorageCredentials.mock.calls[0];
      expect(stored.storageAccessKeyId).toBe('AKIAREPO');
      expect(stored.storageSecretAccessKey).not.toContain('s3cret');
      expect(openStorageCredentials(env.STORAGE_CREDENTIAL_KEY, repoId, stored.storageSecretAccessKey!)).toEqual(
        credentials,
      );
    });

    it('reuses the stored credentials without touching RGW', async () => {
      mocks.rgwAdmin.ensureUser.mockResolvedValue(credentials);
      await sut.ensure(unprovisioned);
      const [, stored] = mocks.repository.setStorageCredentials.mock.calls[0];
      mocks.rgwAdmin.ensureUser.mockClear();

      await expect(
        sut.ensure({ ...unprovisioned, storageSecretAccessKey: stored.storageSecretAccessKey }),
      ).resolves.toEqual(credentials);

      expect(mocks.rgwAdmin.ensureUser).not.toHaveBeenCalled();
    });

    // The compose stack runs against MinIO, which has no RGW admin API.
    it('falls back to the static keys on a cluster without an admin endpoint', async () => {
      mocks.rgwAdmin.supports.mockReturnValue(false);

      await expect(sut.ensure(unprovisioned)).resolves.toEqual({
        accessKeyId: env.STORAGE_STATIC_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_STATIC_SECRET_ACCESS_KEY,
      });
      expect(mocks.rgwAdmin.ensureUser).not.toHaveBeenCalled();
    });
  });

  describe('rotate', () => {
    it('issues a fresh key pair and re-seals it', async () => {
      const rotated = { accessKeyId: 'AKIANEW', secretAccessKey: 'newsecret' };
      mocks.rgwAdmin.rotateKeys.mockResolvedValue(rotated);

      await expect(sut.rotate(unprovisioned)).resolves.toEqual(rotated);

      const [, stored] = mocks.repository.setStorageCredentials.mock.calls[0];
      expect(openStorageCredentials(env.STORAGE_CREDENTIAL_KEY, repoId, stored.storageSecretAccessKey!)).toEqual(
        rotated,
      );
    });
  });

  describe('revoke', () => {
    it('drops the RGW keys and clears the stored ones', async () => {
      await sut.revoke({ ...unprovisioned, storageAccessKeyId: 'AKIAREPO', storageSecretAccessKey: 'sealed' });

      expect(mocks.rgwAdmin.revokeKeys).toHaveBeenCalledWith(cluster, storageUserId(repoId));
      expect(mocks.repository.setStorageCredentials).toHaveBeenCalledWith(repoId, {
        storageAccessKeyId: null,
        storageSecretAccessKey: null,
      });
    });
  });

  describe('seal', () => {
    it('seals against the repository it was minted for', () => {
      const sealed = sut.seal(repoId, credentials);

      expect(openStorageCredentials(env.STORAGE_CREDENTIAL_SEAL_KEY, repoId, sealed)).toEqual(credentials);
      expect(() => openStorageCredentials(env.STORAGE_CREDENTIAL_SEAL_KEY, 'another-repository', sealed)).toThrow();
      expect(() => openStorageCredentials(env.STORAGE_CREDENTIAL_KEY, repoId, sealed)).toThrow();
    });
  });
});
