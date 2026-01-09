import { InternalServerErrorException } from '@nestjs/common';

export class S3Error extends InternalServerErrorException {
  constructor() {
    super('An error occurred with the storage server');
  }
}
