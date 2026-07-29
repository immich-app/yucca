import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export class CryptoRepository {
  randomHex(bytes: number) {
    return randomBytes(bytes).toString('hex');
  }

  randomUUID() {
    return randomUUID();
  }

  secretsMatch(a: string, b: string) {
    return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
  }
}
