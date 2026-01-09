import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { StorageRepository } from 'src/repositories/storage.repository';

describe('StorageRepository (e2e)', () => {
  let sut: StorageRepository;

  beforeEach(() => {
    sut = new StorageRepository();
  });

  it('works', async () => {
    const Bucket = randomUUID();
    const Key = randomUUID();

    const contents = 'test object';

    await expect(sut.checkBucket(Bucket)).resolves.toBe(false);
    await sut.createBucket(Bucket);
    await expect(sut.checkBucket(Bucket)).resolves.toBe(true);

    await expect(sut.headObject(Bucket, Key)).rejects.toThrow();
    await sut.putObject(Bucket, Key, Readable.from(contents), false);
    await sut.headObject(Bucket, Key);

    await expect(sut.listObjects(Bucket, Key)).resolves.toEqual(
      expect.objectContaining({
        Contents: expect.arrayContaining([expect.objectContaining({ Key, Size: contents.length })]),
      }),
    );

    const stream = await sut.getObjectStream(Bucket, Key);
    await expect(text(stream!)).resolves.toBe(contents);

    await sut.deleteObject(Bucket, Key);
    await expect(sut.headObject(Bucket, Key)).rejects.toThrow();
  });

  it('respects worm', async () => {
    const Bucket = randomUUID();
    const Key = randomUUID();

    const contents = 'test object';

    await sut.createBucket(Bucket);
    await sut.putObject(Bucket, Key, Readable.from(contents), false);
    await expect(sut.putObject(Bucket, Key, Readable.from(contents), true)).rejects.toThrow();
  });
});
