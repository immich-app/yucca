import { Attributes, Counter } from '@opentelemetry/api';
import { PassThrough, Readable } from 'node:stream';
import { AuthDto } from 'src/dto/auth.dto';

export function attachMeterToStream(
  stream: Readable,
  meterBytes: Counter,
  callbackBytes: (bytes: number) => void,
  context: Attributes,
) {
  const passthrough = new PassThrough({
    transform(chunk, _, callback) {
      meterBytes.add(chunk.length, context);
      callbackBytes(chunk.length);
      callback(null, chunk);
    },
  });

  stream.pipe(passthrough);

  return passthrough;
}

export function contextFromAuth(auth: AuthDto) {
  return {
    customerId: auth.user,
    repositoryId: auth.repository,
  };
}
