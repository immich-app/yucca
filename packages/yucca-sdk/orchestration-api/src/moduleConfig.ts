export const ModuleConfigProvider = Symbol('ModuleConfig');

export type ModuleConfig = {
  statePath: string;
  yuccaProductionApi: string;
  yuccaProductionIssuer: URL;
  yuccaProductionClientId: string;
  yuccaProductionScope: string;
  yuccaProductionRequirePKCE: boolean;
};
