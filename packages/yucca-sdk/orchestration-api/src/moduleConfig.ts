import type { Socket } from 'socket.io';
import { GatewayEvent } from './events/events.gateway';

export const ModuleConfigProvider = Symbol('ModuleConfig');

export type AuthenticatedUser = { user: { isAdmin: boolean } };
export type AuthenticateFn = (client: Socket) => Promise<AuthenticatedUser>;

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
    createDatabaseBackup(): Promise<void>;
    enterMaintenanceRollback(repositoryId: string, snapshotId: string, backupFileName?: string): Promise<void>;
  };
};

export type ModuleConfig = {
  statePath: string;
  yuccaProductionApi?: string;
  externalBaseUrl?: string;
  requireWsAuth?: boolean;
  requireLock?: boolean;
  developmentMode?: boolean;

  authenticate?: AuthenticateFn;
  onInternalEvent?: (event: GatewayEvent) => void;

  immichIntegration?: ImmichIntegration;
};
