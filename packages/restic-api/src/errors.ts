import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

export class S3Error extends InternalServerErrorException {
  constructor() {
    super('An error occurred with the storage server');
  }
}

export class ChecksumMismatchError extends BadRequestException {
  constructor() {
    super('Content hash does not match blob name');
    this.name = 'ChecksumMismatchError';
  }
}
