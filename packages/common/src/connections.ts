export const ConnectionTypes = ['immich', 'restic'] as const;

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
  revocable: boolean;
}

const MIB = 1 << 20;

export const ConnectionTypeInfos = {
  immich: {
    meters: ['storage', 'transfer', 'activity'],
    reportsActivity: true,
    minObjectSizeBytes: 0,
    revocable: false,
  },
  restic: { meters: ['storage', 'transfer'], reportsActivity: false, minObjectSizeBytes: MIB, revocable: true },
} as const satisfies Record<ConnectionType, ConnectionTypeInfo>;

export const connectionTypeInfo = (type: string): ConnectionTypeInfo | undefined =>
  (ConnectionTypeInfos as Record<string, ConnectionTypeInfo | undefined>)[type];

export const isRevocableConnectionType = (type: string): boolean => connectionTypeInfo(type)?.revocable ?? false;

export const billableBytes = (type: string, sizeBytes: number, objectCount: number): number => {
  const min = connectionTypeInfo(type)?.minObjectSizeBytes ?? 0;
  if (min <= 0) {
    return sizeBytes;
  }
  return Math.max(sizeBytes, objectCount * min);
};
