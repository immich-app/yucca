/**
 * The kinds of things that can consume a user's backup account. `immich`
 * submits client-side telemetry (backup start/end, sizes, logs); a raw
 * `restic` connection only gets server-side traffic attribution via michael.
 */
export const ConnectionTypes = ['immich', 'restic'] as const;

export type ConnectionType = (typeof ConnectionTypes)[number];

export const isConnectionType = (value: string): value is ConnectionType =>
  (ConnectionTypes as readonly string[]).includes(value);

/**
 * Feature flag gating *self-service* use of each connection type. `immich` has
 * none — it's the default connection, always available to everyone. `restic` is
 * individually flagged. Admin-provisioned connections bypass this (admin
 * authority); it gates the user API and device-flow login only.
 */
export const ConnectionTypeFlags = {
  restic: 'connection-restic',
} as const satisfies Partial<Record<ConnectionType, string>>;

/** The flag a user needs to self-serve a connection of this type, if any. */
export const connectionTypeFlag = (type: string): string | undefined =>
  (ConnectionTypeFlags as Record<string, string | undefined>)[type];

/**
 * The three metering tiers, from most to least universal:
 * - `storage`: bytes/objects in the bucket (RadosGW) — every type exposes this, so **billing keys
 *   off it**.
 * - `transfer`: request/byte counts seen by michael — types that flow through michael (immich,
 *   restic), not raw S3.
 * - `activity`: backup start/end/duration/success — only client-reporting types (immich).
 */
export type MeteringTier = 'storage' | 'transfer' | 'activity';

export interface ConnectionTypeInfo {
  /** Metering tiers this type exposes. `storage` is always present. */
  meters: readonly MeteringTier[];
  /** Whether the client self-reports backup activity (start/end/duration). */
  reportsActivity: boolean;
  /**
   * Billing floor: each object is billed at least this many bytes. immich (managed, large restic
   * packs) is exempt (0); raw restic / S3 pay a 1 MiB/object minimum for small-object overhead.
   */
  minObjectSizeBytes: number;
  /**
   * Whether tokens of this type are individually revocable. Revocable types maintain a Redis
   * "validity" marker per minted token that michael checks per request (present = valid, absent =
   * revoked/unknown → denied). Non-revocable types (immich, whose access rides the device-flow
   * session) keep NO marker, so michael must **skip** the validity check for them — otherwise the
   * absent marker would wrongly deny every request. michael mirrors this set via
   * `REVOCABLE_CONNECTION_TYPES` (default `restic`).
   */
  revocable: boolean;
}

const MIB = 1 << 20;

/**
 * Per-type capability + billing descriptor. The set of connection types and their behavior is
 * **code**; only per-user/instance state is data. Adding a type is a one-object change here.
 */
export const ConnectionTypeInfos = {
  immich: {
    meters: ['storage', 'transfer', 'activity'],
    reportsActivity: true,
    minObjectSizeBytes: 0,
    revocable: false,
  },
  restic: { meters: ['storage', 'transfer'], reportsActivity: false, minObjectSizeBytes: MIB, revocable: true },
  // s3 (future): { meters: ['storage'], reportsActivity: false, minObjectSizeBytes: MIB, revocable: true },
} as const satisfies Record<ConnectionType, ConnectionTypeInfo>;

export const connectionTypeInfo = (type: string): ConnectionTypeInfo | undefined =>
  (ConnectionTypeInfos as Record<string, ConnectionTypeInfo | undefined>)[type];

/**
 * Whether a connection type's tokens are individually revocable — i.e. michael maintains and
 * checks a per-token validity marker for it. Unknown types are treated as non-revocable (skip).
 */
export const isRevocableConnectionType = (type: string): boolean => connectionTypeInfo(type)?.revocable ?? false;

/**
 * Billable bytes for a connection's storage, applying the type's per-object floor.
 *
 * RadosGW exposes only total size + object count (no per-object histogram), so the exact
 * `Σ max(objectSize_i, minObjectSizeBytes)` is approximated by
 * `max(sizeBytes, objectCount * minObjectSizeBytes)`. This under-counts a repo that mixes large
 * and small objects, but in practice restic writes large pack files so `sizeBytes` dominates and
 * the floor only bites for tiny/new repos or many-small-object raw-S3 — the intended cases.
 * Unknown types are treated as no floor (billed at raw `sizeBytes`).
 */
export const billableBytes = (type: string, sizeBytes: number, objectCount: number): number => {
  const min = connectionTypeInfo(type)?.minObjectSizeBytes ?? 0;
  if (min <= 0) {
    return sizeBytes;
  }
  return Math.max(sizeBytes, objectCount * min);
};
