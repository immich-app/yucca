import type { Socket } from 'socket.io';
import { GatewayEvent } from './events/events.gateway';
import type { ResticProxyThrottle } from './proxy/resticProxy';

export const ModuleConfigProvider = Symbol('ModuleConfig');

export type AuthenticatedUser = { user: { isAdmin: boolean } };
export type AuthenticateFn = (client: Socket) => Promise<AuthenticatedUser>;

export type ImmichDatabaseDumpConfig = {
  enabled: boolean;
  keepLastAmount: number;
};

export type ImmichIntegration = {
  dataPath: string;
  dataFolders: string[];
  libraries: {
    id: string;
    name: string;
    importPaths: string[];
    exclusionPatterns: string[];
  }[];
  hooks: {
    createDatabaseBackup(signal: AbortSignal): Promise<string>;
    cleanupDatabaseBackups(): Promise<void>;
    getImmichDatabaseDumpConfig(): Promise<ImmichDatabaseDumpConfig>;
    configureImmichDatabaseDump(config: Partial<ImmichDatabaseDumpConfig>): Promise<void>;
    enterMaintenanceRollback(
      repositoryId: string,
      snapshotId: string,
      backupFileName?: string,
    ): Promise<{ jwt: string }>;
  };
};

export type ModuleConfig = {
  statePath: string;
  cachePath?: string;
  wellKnownUrl?: string;
  externalBaseUrl?: string;
  requireWsAuth?: boolean;
  requireSession?: boolean;
  requireLock?: boolean;
  developmentMode?: boolean;
  throttle?: ResticProxyThrottle;

  authenticate?: AuthenticateFn;
  onInternalEvent?: (event: GatewayEvent) => void;

  immichIntegration?: ImmichIntegration;
};
