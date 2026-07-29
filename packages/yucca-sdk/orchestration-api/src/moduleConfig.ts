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
    createDatabaseBackup(): Promise<string>;
    enterMaintenanceRollback(
      repositoryId: string,
      snapshotId: string,
      backupFileName?: string,
    ): Promise<{ jwt: string }>;
  };
};

export type ModuleConfig = {
  statePath: string;
  yuccaProductionApi?: string;
  // Discovery entry point ({"meta_url": ...} pointer); defaults to production
  // (YUCCA_WELL_KNOWN). Host apps typically feed this from
  // FUTO_BACKUPS_WELL_KNOWN_URL to target staging or a local dev stack.
  wellKnownUrl?: string;
  externalBaseUrl?: string;
  requireWsAuth?: boolean;
  requireLock?: boolean;
  developmentMode?: boolean;

  authenticate?: AuthenticateFn;
  onInternalEvent?: (event: GatewayEvent) => void;

  immichIntegration?: ImmichIntegration;
};
