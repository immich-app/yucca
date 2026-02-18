export const ModuleConfigProvider = Symbol('ModuleConfig');

export type ModuleConfig = {
  statePath: string;
  yuccaProductionApi: string;
};
