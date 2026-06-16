export const ModuleConfigProvider = Symbol('ModuleConfig');

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

  immichIntegration?: ImmichIntegration;
};
