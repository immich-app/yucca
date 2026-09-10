import { z } from 'zod';

export const isoDatetimeToDate = z
  .codec(z.iso.datetime({ offset: true }), z.date(), {
    decode: (isoString) => new Date(isoString),
    encode: (date) => date.toISOString(),
  })
  .meta({ example: '2024-01-01T00:00:00.000Z' });
