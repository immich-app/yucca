export const ConnectionTypes = ['immich', 'restic'] as const;

export type ConnectionType = (typeof ConnectionTypes)[number];

export const isConnectionType = (value: string): value is ConnectionType =>
  (ConnectionTypes as readonly string[]).includes(value);

export const ConnectionTypeFlags = {
  restic: 'connection-restic',
} as const satisfies Partial<Record<ConnectionType, string>>;

export const connectionTypeFlag = (type: string): string | undefined =>
  (ConnectionTypeFlags as Record<string, string | undefined>)[type];
