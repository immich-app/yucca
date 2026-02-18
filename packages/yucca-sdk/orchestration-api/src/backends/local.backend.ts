/* eslint-disable @typescript-eslint/require-await */

import { Backend } from './backend';

export class LocalBackend extends Backend {
  async online(): Promise<boolean> {
    return true;
  }
}
