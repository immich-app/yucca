/* eslint-disable @typescript-eslint/require-await */

import { Backend } from './backend';

export class S3Backend extends Backend {
  async online(): Promise<boolean> {
    return true;
  }
}
