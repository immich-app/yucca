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

  setErrorCause(cause: unknown) {
    this.context['error.cause'] =
      cause instanceof Error ? { type: cause.constructor.name, message: cause.message, stack: cause.stack } : cause;
  }

  applyContext(event: any) {
    Object.assign(event, this.context);
  }
}
