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
  // The consumer API surface (create/adopt/manage consumers, multiple immich
  // instances) is available to everyone. These flags gate self-service use of
  // the individual non-default consumer *types* — see ConsumerTypeFlags.
  consumerRestic: {
    key: 'consumer-restic',
    default: false,
    stage: 'experimental',
    description: 'Use raw restic (create restic consumers / self-service tokens)',
    since: '0.22.0',
  },
  consumerFubar: {
    key: 'consumer-fubar',
    default: false,
    stage: 'experimental',
    description: 'Use the fubar CLI (create/bind fubar consumers)',
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
