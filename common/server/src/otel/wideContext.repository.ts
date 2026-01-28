import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class WideContextRepository {
  context: Record<string, unknown> = {};

  addContext(key: string, object: unknown) {
    this.context[key] = object;
  }

  assignContext(object: unknown) {
    Object.assign(this.context, object);
  }

  setErrorCause(cause: any) {
    this.context['error.cause'] = cause;
  }

  applyContext(event: any) {
    Object.assign(event, this.context);
  }
}
