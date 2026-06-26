import type { Socket } from 'socket.io';

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
};

export type ModuleConfig = {
  statePath: string;
  yuccaProductionApi?: string;
  externalBaseUrl?: string;
  requireWsAuth?: boolean;
  requireLock?: boolean;
  developmentMode?: boolean;

  authenticate?: AuthenticateFn;

  immichIntegration?: ImmichIntegration;
};
