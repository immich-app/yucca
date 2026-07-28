export type FeatureFlagStage = 'experimental' | 'beta' | 'ga' | 'retired';

export interface FeatureFlagDef {
  key: string;
  default: boolean;
  stage: FeatureFlagStage;
  description: string;
  since: string;
}

/**
 * The feature-flag registry: the set of flags is code, the state of flags is
 * data. A flag's default comes from here (flipped at GA via a release); the
 * `userFeatureFlagOverride` table stores per-user exceptions only.
 */
export const FeatureFlags = {
  // The connection API surface (create/adopt/manage connections, multiple immich
  // instances) is available to everyone. This flag gates self-service use of
  // the non-default `restic` connection type — see ConnectionTypeFlags.
  connectionRestic: {
    key: 'connection-restic',
    default: false,
    stage: 'experimental',
    description: 'Use raw restic (create restic connections / self-service tokens)',
    since: '0.22.0',
  },
} as const satisfies Record<string, FeatureFlagDef>;

export type FeatureFlagKey = (typeof FeatureFlags)[keyof typeof FeatureFlags]['key'];

export const featureFlagDefs = (): FeatureFlagDef[] => Object.values(FeatureFlags);

export const featureFlagByKey = (key: string): FeatureFlagDef | undefined =>
  featureFlagDefs().find((flag) => flag.key === key);

/**
 * Resolve a user's effective flags: override wins, registry default otherwise.
 * Overrides for flags no longer in the registry are ignored.
 */
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
