import { S3ServiceException } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';

export class S3Error extends InternalServerErrorException {
  constructor(cause: S3ServiceException) {
    super('An error occurred with the storage server', { cause });
  }
}
