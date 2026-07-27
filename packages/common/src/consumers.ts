/**
 * The kinds of things that can consume a user's backup account. `immich` and
 * `fubar` submit client-side telemetry (backup start/end, sizes, logs); a raw
 * `restic` consumer only gets server-side traffic attribution via michael.
 */
export const ConsumerTypes = ['immich', 'fubar', 'restic'] as const;

export type ConsumerType = (typeof ConsumerTypes)[number];

export const isConsumerType = (value: string): value is ConsumerType =>
  (ConsumerTypes as readonly string[]).includes(value);
