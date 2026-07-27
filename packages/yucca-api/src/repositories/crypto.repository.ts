import { randomBytes, randomUUID } from 'node:crypto';

export class CryptoRepository {
  randomHex(bytes: number) {
    return randomBytes(bytes).toString('hex');
  }

  randomUUID() {
    return randomUUID();
  }
}
