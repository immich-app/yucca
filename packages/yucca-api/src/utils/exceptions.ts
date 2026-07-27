import { ForbiddenException } from '@nestjs/common';

export class EmailNotAllowedException extends ForbiddenException {
  constructor() {
    super('Email is not allowed during the beta');
  }
}
