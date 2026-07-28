import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from 'src/env';

const keyFor = (jti: string) => `yucca:restic:valid:${jti}`;

// Maintains the Redis "validity" markers michael checks per request: a present
// key means the token is valid, an absent key means revoked or unknown. This is
// the inverse of the old denylist and is what makes revocation safe for
// long-lived tokens — a lost marker denies rather than silently permits.
//
// The DB (resticTokens) stays the source of truth; the metrics-worker reconcile
// re-asserts markers from it, so Redis itself is ephemeral. Only revocable
// connection types (restic) get markers — michael skips the check for the rest.
@Injectable()
export class RevocationRepository implements OnModuleDestroy {
  private client?: Redis;

  constructor(private readonly logger: LoggerRepository) {
    if (!env.REDIS_URL) {
      this.logger.warn('REDIS_URL is not set — restic token validity will not propagate to michael');
    }
  }

  private getClient() {
    this.client ??= new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, connectTimeout: 2000, lazyConnect: true });
    return this.client;
  }

  // Call on mint. The marker expires with the token (EXAT), so a lapsed token
  // needs no explicit cleanup.
  async markValid(jti: string, expiresAt: Date) {
    if (!env.REDIS_URL) {
      return;
    }
    const exat = Math.ceil(expiresAt.getTime() / 1000);
    if (exat <= Math.floor(Date.now() / 1000)) {
      return;
    }
    await this.getClient().set(keyFor(jti), '1', 'EXAT', exat);
  }

  // Call on revoke. Deleting the marker makes michael treat the jti as invalid
  // within its fresh-cache TTL.
  async markInvalid(jti: string) {
    if (!env.REDIS_URL) {
      return;
    }
    await this.getClient().del(keyFor(jti));
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
