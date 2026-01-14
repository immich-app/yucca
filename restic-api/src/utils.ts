import { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { ContentType } from './enum';

/**
 * Process S3 object as web response
 *
 * References:
 * http#ServeContent
 * https://pkg.go.dev/net/http#ServeContent
 */
export function respondWithObject(object: GetObjectCommandOutput, request: Request, response: Response) {
  if (request.headers['if-none-match'] === object.ETag) {
    return response.send(HttpStatus.NOT_MODIFIED);
  }

  const range = request.headers.range;
  if (range && range !== 'bytes=0-') {
    response.status(HttpStatus.PARTIAL_CONTENT);
  } else {
    response.status(HttpStatus.OK);
  }

  console.info(object);

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

  const webStream = object.Body?.transformToWebStream();
  if (webStream) {
    Readable.fromWeb(webStream as ReadableStream).pipe(response);
  } else {
    return response.send(HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
