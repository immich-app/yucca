import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { env } from 'src/env';
import { TopologyStorageCluster } from 'src/repositories/topology.repository';

export type StorageUserKeys = { accessKeyId: string; secretAccessKey: string };

type RgwKey = { user: string; access_key: string; secret_key: string };
type RgwUser = { user_id: string; keys?: RgwKey[] };
type RgwResponse = { status: number; ok: boolean; body: any };

// The admin credential lives here, in the control plane; michael only ever sees
// the keys of the one repository a request is for.
@Injectable()
export class RgwAdminRepository {
  private clients = new Map<string, AwsClient>();

  supports(cluster: TopologyStorageCluster): boolean {
    return Boolean(cluster.rgw_admin_endpoint);
  }

  async ensureUser(cluster: TopologyStorageCluster, uid: string, displayName: string): Promise<StorageUserKeys> {
    // max-buckets=1: the user owns exactly the one bucket backing its
    // repository, so a leaked key cannot stand up storage of its own.
    const created = await this.request(cluster, 'PUT', '/admin/user', {
      uid,
      'display-name': displayName,
      'max-buckets': '1',
    });
    if (created.ok) {
      return this.firstKey(cluster, uid, created.body as RgwUser);
    }
    if (errorCode(created) !== 'UserAlreadyExists') {
      throw rgwError('create user', uid, created);
    }

    const existing = await this.request(cluster, 'GET', '/admin/user', { uid });
    if (!existing.ok) {
      throw rgwError('read user', uid, existing);
    }
    return this.firstKey(cluster, uid, existing.body as RgwUser);
  }

  // Drops every other key, so the credentials an already-minted token carries
  // stop working.
  async rotateKeys(cluster: TopologyStorageCluster, uid: string): Promise<StorageUserKeys> {
    const before = await this.request(cluster, 'GET', '/admin/user', { uid });
    if (!before.ok) {
      throw rgwError('read user', uid, before);
    }
    const stale = new Set(((before.body as RgwUser).keys ?? []).map((key) => key.access_key));

    const generated = await this.request(cluster, 'PUT', '/admin/user', { key: '', uid, 'generate-key': 'True' });
    if (!generated.ok) {
      throw rgwError('generate key', uid, generated);
    }

    const fresh = (generated.body as RgwKey[]).find((key) => !stale.has(key.access_key));
    if (!fresh) {
      throw new Error(`RGW generated no new key for user '${uid}' on cluster '${cluster.code}'`);
    }

    for (const accessKey of stale) {
      await this.removeKey(cluster, uid, accessKey);
    }
    return { accessKeyId: fresh.access_key, secretAccessKey: fresh.secret_key };
  }

  // The bucket is left alone: deleting a repository has never deleted its data,
  // and it must not start here.
  async revokeKeys(cluster: TopologyStorageCluster, uid: string): Promise<void> {
    const user = await this.request(cluster, 'GET', '/admin/user', { uid });
    if (!user.ok) {
      if (errorCode(user) === 'NoSuchUser') {
        return;
      }
      throw rgwError('read user', uid, user);
    }

    for (const key of (user.body as RgwUser).keys ?? []) {
      await this.removeKey(cluster, uid, key.access_key);
    }
  }

  private async removeKey(cluster: TopologyStorageCluster, uid: string, accessKey: string): Promise<void> {
    const removed = await this.request(cluster, 'DELETE', '/admin/user', {
      key: '',
      uid,
      'access-key': accessKey,
    });
    if (!removed.ok && errorCode(removed) !== 'InvalidAccessKeyId') {
      throw rgwError('remove key', uid, removed);
    }
  }

  private async firstKey(cluster: TopologyStorageCluster, uid: string, user: RgwUser): Promise<StorageUserKeys> {
    const key = user.keys?.find((key) => key.user === uid) ?? user.keys?.[0];
    if (key) {
      return { accessKeyId: key.access_key, secretAccessKey: key.secret_key };
    }
    return this.rotateKeys(cluster, uid);
  }

  private async request(
    cluster: TopologyStorageCluster,
    method: string,
    path: string,
    query: Record<string, string>,
  ): Promise<RgwResponse> {
    const url = new URL(cluster.rgw_admin_endpoint!);
    url.pathname = path;
    url.search = new URLSearchParams(query).toString();

    const response = await this.client(cluster).fetch(url.toString(), { method });
    const text = await response.text();
    let body: any = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, ok: response.ok, body };
  }

  private client(cluster: TopologyStorageCluster): AwsClient {
    const endpoint = cluster.rgw_admin_endpoint;
    if (!endpoint) {
      throw new Error(`Storage cluster '${cluster.code}' has no rgw_admin_endpoint`);
    }

    const cacheKey = `${cluster.code}:${endpoint}`;
    const cached = this.clients.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Same per-cluster override convention as yucca-metrics-worker, so one
    // object-user Secret can be mounted with envFrom under these exact names.
    const suffix = cluster.code.toUpperCase().replaceAll('-', '_');
    const accessKeyId = process.env[`RADOS_ACCESS_KEY_ID_${suffix}`] ?? env.RADOS_ACCESS_KEY_ID;
    const secretAccessKey = process.env[`RADOS_SECRET_ACCESS_KEY_${suffix}`] ?? env.RADOS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `No RGW admin credentials for cluster '${cluster.code}' ` +
          `(set RADOS_ACCESS_KEY_ID_${suffix}/RADOS_SECRET_ACCESS_KEY_${suffix} or the RADOS_* fallback)`,
      );
    }

    const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'rgw' });
    this.clients.set(cacheKey, client);
    return client;
  }
}

const errorCode = (response: RgwResponse): string | undefined =>
  typeof response.body === 'object' && response.body !== null ? (response.body.Code as string) : undefined;

const rgwError = (action: string, uid: string, response: RgwResponse): Error =>
  new Error(
    `RGW admin failed to ${action} '${uid}': ${response.status} ${errorCode(response) ?? JSON.stringify(response.body)}`,
  );
