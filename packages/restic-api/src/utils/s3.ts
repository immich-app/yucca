import { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { HttpStatus } from '@nestjs/common';
import { Counter } from '@opentelemetry/api';
import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { AuthDto } from 'src/dto/auth.dto';
import { ContentType } from '../enum';
import { attachMeterToStream, contextFromAuth } from './meters';

export interface S3RemoteObject {
  stream(): Readable | undefined;
  object: GetObjectCommandOutput;
}

export function attachMeterToS3GetObject(
  auth: AuthDto,
  object: GetObjectCommandOutput,
  requestedBytes: Counter,
  downloadedBytes: Counter,
): S3RemoteObject {
  const context = contextFromAuth(auth);
  requestedBytes.add(object.ContentLength || 0, context);

  return {
    object,
    stream() {
      const webStream = object.Body?.transformToWebStream();
      if (webStream) {
        return attachMeterToStream(
          Readable.fromWeb(webStream as ReadableStream),
          downloadedBytes,
          () => void 0,
          context,
        );
      }
    },
  };
}

// Modeled on Go's http#ServeContent: https://pkg.go.dev/net/http#ServeContent
export function respondWithObject({ stream, object }: S3RemoteObject, request: Request, response: Response) {
  if (request.headers['if-none-match'] === object.ETag) {
    return response.send(HttpStatus.NOT_MODIFIED);
  }

  const range = request.headers.range;
  if (range && range !== 'bytes=0-') {
    response.status(HttpStatus.PARTIAL_CONTENT);
  } else {
    response.status(HttpStatus.OK);
  }

  if (object.ETag) {
    response.header('ETag', object.ETag);
  }

  response.set('Content-Type', object.ContentType ?? ContentType.Binary);

  if (object.ContentRange) {
    response.set('Content-Range', object.ContentRange);
  }

  if (object.ContentLength) {
    response.set('Content-Length', object.ContentLength.toString());
  }

  const readable = stream();
  if (readable) {
    readable.pipe(response);
  } else {
    return response.send(HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
