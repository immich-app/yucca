export const ConnectionTypes = ['immich', 'standalone', 'restic'] as const;

export type ConnectionType = (typeof ConnectionTypes)[number];

export const isConnectionType = (value: string): value is ConnectionType =>
  (ConnectionTypes as readonly string[]).includes(value);

export const ConnectionTypeFlags = {
  restic: 'connection-restic',
} as const satisfies Partial<Record<ConnectionType, string>>;

export const connectionTypeFlag = (type: string): string | undefined =>
  (ConnectionTypeFlags as Record<string, string | undefined>)[type];

export type MeteringTier = 'storage' | 'transfer' | 'activity';

export interface ConnectionTypeInfo {
  meters: readonly MeteringTier[];
  reportsActivity: boolean;
  minObjectSizeBytes: number;
}

const MIB = 1 << 20;

export const ConnectionTypeInfos = {
  immich: { meters: ['storage', 'transfer', 'activity'], reportsActivity: true, minObjectSizeBytes: 0 },
  standalone: { meters: ['storage', 'transfer', 'activity'], reportsActivity: true, minObjectSizeBytes: MIB },
  restic: { meters: ['storage', 'transfer'], reportsActivity: false, minObjectSizeBytes: MIB },
} as const satisfies Record<ConnectionType, ConnectionTypeInfo>;

export const connectionTypeInfo = (type: string): ConnectionTypeInfo | undefined =>
  (ConnectionTypeInfos as Record<string, ConnectionTypeInfo | undefined>)[type];

export const billableBytes = (type: string, sizeBytes: number, objectCount: number): number => {
  const min = connectionTypeInfo(type)?.minObjectSizeBytes ?? 0;
  if (min <= 0) {
    return sizeBytes;
  }
  return Math.max(sizeBytes, objectCount * min);
};
