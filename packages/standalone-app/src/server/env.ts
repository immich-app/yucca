import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const optionalString = z.string().trim().min(1).optional();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(22_676),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  YUCCA_STATE_PATH: z.string().trim().min(1).default(resolve(homedir(), '.yucca')),
  YUCCA_WELL_KNOWN_URL: optionalString,
  YUCCA_UI_PATH: optionalString,
});

export type Env = {
  port: number;
  host: string;
  statePath: string;
  wellKnownUrl?: string;
  uiPath?: string;
};

export const readEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );

  const parsed = schema.parse({
    ...present,
    YUCCA_WELL_KNOWN_URL: present.YUCCA_WELL_KNOWN_URL ?? present.FUTO_BACKUPS_WELL_KNOWN_URL,
  });

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    statePath: resolve(parsed.YUCCA_STATE_PATH),
    wellKnownUrl: parsed.YUCCA_WELL_KNOWN_URL,
    uiPath: parsed.YUCCA_UI_PATH ? resolve(parsed.YUCCA_UI_PATH) : undefined,
  };
};
