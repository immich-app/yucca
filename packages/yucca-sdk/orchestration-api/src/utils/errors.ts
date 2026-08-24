import { WriteStream } from 'node:fs';

export function writeError(stream: WriteStream, error: unknown) {
  const events = Array.isArray((error as { error?: unknown })?.error)
    ? ((error as { error: unknown[] }).error as object[])
    : [{ message_type: 'error', error: `${error}` }];

  for (const event of events) {
    stream.write(JSON.stringify(event) + '\n');
  }
}
