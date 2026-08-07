import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface StorageCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

// Wire format of the `storageCredentials` claim, mirrored byte for byte by
// michael (packages/michael/internal/credentials). Changing it breaks every
// token in flight:
//
//   base64url(version[1] || nonce[12] || ciphertext || tag[16])
//
// The repository id is the additional authenticated data, so a blob lifted into
// another repository's token fails to open rather than granting its bucket.
const VERSION = 1;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

export const sealStorageCredentials = (key: Buffer, repositoryId: string, credentials: StorageCredentials): string => {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Storage credential key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(repositoryId, 'utf8'));

  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return Buffer.concat([Buffer.from([VERSION]), nonce, ciphertext, cipher.getAuthTag()]).toString('base64url');
};

// Tries every configured key, so a rotation can run with the new key primary
// and the old one still accepted.
export const openStorageCredentials = (
  keys: readonly Buffer[],
  repositoryId: string,
  sealed: string,
): StorageCredentials => {
  const blob = Buffer.from(sealed, 'base64url');
  if (blob.length < 1 + NONCE_BYTES + TAG_BYTES) {
    throw new Error('Sealed storage credentials are truncated');
  }
  if (blob[0] !== VERSION) {
    throw new Error(`Unsupported sealed storage credential version ${blob[0]}`);
  }

  const nonce = blob.subarray(1, 1 + NONCE_BYTES);
  const ciphertext = blob.subarray(1 + NONCE_BYTES, blob.length - TAG_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);

  for (const key of keys) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(Buffer.from(repositoryId, 'utf8'));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as StorageCredentials;
    } catch {
      continue;
    }
  }

  throw new Error('Sealed storage credentials could not be opened with any configured key');
};

// The first key seals; the rest are decrypt-only, which is what makes a
// rotation a two-step deploy instead of a flag day.
export const parseStorageCredentialKeys = (value: string): Buffer[] => {
  const keys = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Buffer.from(entry, 'base64'));

  if (keys.length === 0) {
    throw new Error('At least one storage credential key is required');
  }
  for (const key of keys) {
    if (key.length !== KEY_BYTES) {
      throw new Error(`Storage credential keys must be base64-encoded ${KEY_BYTES}-byte values`);
    }
  }
  return keys;
};
