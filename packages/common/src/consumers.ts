/**
 * The kinds of things that can consume a user's backup account. `immich` and
 * `fubar` submit client-side telemetry (backup start/end, sizes, logs); a raw
 * `restic` consumer only gets server-side traffic attribution via michael.
 */
export const ConsumerTypes = ['immich', 'fubar', 'restic'] as const;

export type ConsumerType = (typeof ConsumerTypes)[number];

export const isConsumerType = (value: string): value is ConsumerType =>
  (ConsumerTypes as readonly string[]).includes(value);

/**
 * Feature flag gating *self-service* use of each consumer type. `immich` has
 * none — it's the default consumer, always available to everyone. `fubar` and
 * `restic` are individually flagged. Admin-provisioned consumers bypass this
 * (admin authority); it gates the user API and device-flow login only.
 */
export const ConsumerTypeFlags = {
  fubar: 'consumer-fubar',
  restic: 'consumer-restic',
} as const satisfies Partial<Record<ConsumerType, string>>;

/** The flag a user needs to self-serve a consumer of this type, if any. */
export const consumerTypeFlag = (type: string): string | undefined =>
  (ConsumerTypeFlags as Record<string, string | undefined>)[type];
