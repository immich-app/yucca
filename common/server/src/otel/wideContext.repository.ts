import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class WideContextRepository {
  context: Record<string, unknown> = {};

  addContext(key: string, object: unknown) {
    this.context[key] = object;
  }

  applyContext(event: any) {
    Object.assign(event, this.context);
  }
}
