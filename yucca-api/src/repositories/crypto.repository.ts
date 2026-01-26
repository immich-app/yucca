import { randomBytes } from 'node:crypto';

export class CryptoRepository {
  randomHex(bytes: number) {
    return randomBytes(bytes).toString('hex');
  }
}
