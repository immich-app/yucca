import { AwsClient } from 'aws4fetch';
import { RgwAdminRepository } from 'src/repositories/rgwAdmin.repository';
import { TopologyStorageCluster } from 'src/repositories/topology.repository';

// Needs a real RadosGW: `mise k3d:up && mise tilt:ci-infra`, then
// `mise test:integration:k3d` (which exports RADOS_*). Skipped otherwise —
// MinIO has no admin API to run this against.
const endpoint = process.env.RADOS_ENDPOINT;
const configured = Boolean(endpoint && process.env.RADOS_ACCESS_KEY_ID && process.env.RADOS_SECRET_ACCESS_KEY);
const describeRgw = configured ? describe : describe.skip;

const cluster = {
  code: 'local-dev',
  display_name: 'Local development storage',
  active: true,
  rgw_admin_endpoint: endpoint,
} as TopologyStorageCluster;

describeRgw('RgwAdminRepository (integration)', () => {
  const repository = new RgwAdminRepository();
  const uid = `yucca-repo-it-${Date.now()}`;
  const bucket = `${uid}-bucket`;

  const canWrite = async (keys: { accessKeyId: string; secretAccessKey: string }, method: string) => {
    const client = new AwsClient({ ...keys, service: 's3', region: 'rgw' });
    const response = await client.fetch(new URL(`/${bucket}`, endpoint).toString(), { method });
    return response.status;
  };

  afterAll(async () => {
    if (!configured) {
      return;
    }
    await repository.revokeKeys(cluster, uid).catch(() => undefined);
  });

  it('creates the user and returns keys that can stand up its bucket', async () => {
    const keys = await repository.ensureUser(cluster, uid, 'integration test repository');

    expect(keys.accessKeyId).toEqual(expect.any(String));
    expect(keys.secretAccessKey).toEqual(expect.any(String));
    // 200 proves RGW accepted a request signed with the freshly minted keys.
    await expect(canWrite(keys, 'PUT')).resolves.toBe(200);
  });

  it('is idempotent: a second ensure returns the same key', async () => {
    const first = await repository.ensureUser(cluster, uid, 'integration test repository');
    const second = await repository.ensureUser(cluster, uid, 'integration test repository');

    expect(second.accessKeyId).toBe(first.accessKeyId);
  });

  // Rotation answers a leaked credential, so the old key has to stop working,
  // not merely be superseded.
  it('rotate issues a new key and invalidates the old one', async () => {
    const before = await repository.ensureUser(cluster, uid, 'integration test repository');
    const after = await repository.rotateKeys(cluster, uid);

    expect(after.accessKeyId).not.toBe(before.accessKeyId);
    await expect(canWrite(after, 'HEAD')).resolves.toBe(200);
    await expect(canWrite(before, 'HEAD')).resolves.toBe(403);
  });

  it('revoke leaves the bucket but kills every key', async () => {
    const keys = await repository.ensureUser(cluster, uid, 'integration test repository');
    await repository.revokeKeys(cluster, uid);

    await expect(canWrite(keys, 'HEAD')).resolves.toBe(403);

    // The bucket is still there — deleting a repository has never deleted data.
    const admin = new AwsClient({
      accessKeyId: process.env.RADOS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.RADOS_SECRET_ACCESS_KEY!,
      service: 's3',
      region: 'rgw',
    });
    const stats = await admin.fetch(
      `${endpoint!.replace(/\/$/, '')}/admin/bucket?${new URLSearchParams({ bucket, format: 'json' })}`,
    );
    expect(stats.status).toBe(200);
  });
});
