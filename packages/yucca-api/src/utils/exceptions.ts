import { ForbiddenException } from '@nestjs/common';

export class EmailNotAllowedException extends ForbiddenException {
  constructor() {
    super('Email is not allowed during the beta');
  }
}

export class FeatureNotEnabledException extends ForbiddenException {
  constructor(feature: string) {
    super(`Feature '${feature}' is not enabled for this account`);
  }
}
