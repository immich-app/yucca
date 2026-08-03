export type FeatureFlagStage = 'experimental' | 'beta' | 'ga' | 'retired';

export interface FeatureFlagDefinition {
  key: string;
  default: boolean;
  stage: FeatureFlagStage;
  description: string;
  since: string;
}

export const FeatureFlags = {
  connectionRestic: {
    key: 'connection-restic',
    default: false,
    stage: 'experimental',
    description: 'Use raw restic (create restic connections / self-service tokens)',
    since: '0.22.0',
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = (typeof FeatureFlags)[keyof typeof FeatureFlags]['key'];

export const featureFlagDefs = (): FeatureFlagDefinition[] => Object.values(FeatureFlags);

export const featureFlagByKey = (key: string): FeatureFlagDefinition | undefined =>
  featureFlagDefs().find((flag) => flag.key === key);

export const resolveFeatures = (
  overrides: ReadonlyArray<{ flag: string; value: boolean }>,
): Record<string, boolean> => {
  const features: Record<string, boolean> = {};
  for (const flag of featureFlagDefs()) {
    features[flag.key] = flag.default;
  }
  for (const override of overrides) {
    if (override.flag in features) {
      features[override.flag] = override.value;
    }
  }
  return features;
};
