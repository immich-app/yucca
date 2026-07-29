import { isValidConnectionsMath } from 'src/utils/connectionsMath';
import { z } from 'zod';

// The canonical registry of mutable configuration keys. Scoped overrides
// (global / site:<code> / cluster:<code>) stored in the settings table must
// validate against this schema; unknown keys are rejected.
export const configOverridesSchema = z
  .object({
    restic_pack_size_mib: z.number().int().min(1).max(128).optional(),
    connections_math: z
      .string()
      .refine(
        isValidConnectionsMath,
        'Invalid connections_math expression (allowed: integers, cores, min, max, + - * /)',
      )
      .optional(),
  })
  .strict();

export type ConfigOverrides = z.infer<typeof configOverridesSchema>;

export const DEFAULT_CONFIG: Required<ConfigOverrides> = {
  restic_pack_size_mib: 16,
  connections_math: '16',
};

const SCOPE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type SettingsScope = { kind: 'global' } | { kind: 'site' | 'cluster'; code: string };

export const parseSettingsScope = (scope: string): SettingsScope | null => {
  if (scope === 'global') {
    return { kind: 'global' };
  }

  const [kind, code, ...rest] = scope.split(':');
  if ((kind === 'site' || kind === 'cluster') && code && rest.length === 0 && SCOPE_CODE_PATTERN.test(code)) {
    return { kind, code };
  }

  return null;
};
