import { S3ServiceException } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { AuthDto } from 'src/dto/auth.dto';
import { BlobType } from 'src/enum';
import { type Mocks, newMocks } from '../../test/mocks';
import { AppService } from './app.service';

const mockAuth = (writeOnce = false): AuthDto => ({
  user: 'user',
  repository: 'repository',
  writeOnce,
});

describe(AppService.name, () => {
  let mocks: Mocks;
  let sut: AppService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AppService(mocks.storage as never, mocks.metricService as never);
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('createRepository', () => {
    it('should fail if isCreate is false', async () => {
      await expect(sut.createRepository('repository', false)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalledTimes(0);
    });

    it('should fail if bucket exists', async () => {
      mocks.storage.checkBucket.mockResolvedValue(true);
      await expect(sut.createRepository('repository', true)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalledTimes(0);
    });

    it('should succeed if bucket does not exist', async () => {
      mocks.storage.checkBucket.mockResolvedValue(false);
      await sut.createRepository('repository', true);
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalled();
    });

    it('should fail if S3 command throws', async () => {
      mocks.storage.checkBucket.mockRejectedValueOnce(void 0);
      await expect(sut.createRepository('repository', true)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalledTimes(0);

      mocks.storage.createBucket.mockRejectedValueOnce(void 0);
      await expect(sut.createRepository('repository', true)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalled();
    });
  });

  describe('deleteRepository', () => {
    it('should do nothing', () => {
      sut.deleteRepository();
    });
  });

  describe('checkConfig', () => {
    it('should return content length', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 123, $metadata: void 0 as never });
      const result = await sut.checkConfig(mockAuth());
      expect(result).toBe(123);
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'config');
    });

    it('should return 0 if content length is undefined', async () => {
      mocks.storage.headObject.mockResolvedValue({ $metadata: void 0 as never });
      const result = await sut.checkConfig(mockAuth());
      expect(result).toBe(0);
    });

    it('should throw if headObject fails', async () => {
      mocks.storage.headObject.mockRejectedValue(void 0);
      await expect(sut.checkConfig(mockAuth())).rejects.toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return the stream', async () => {
      const object = Symbol('Object');
      mocks.storage.getObject.mockResolvedValue(object as never);
      const result = await sut.getConfig(mockAuth());
      expect(result).toEqual(expect.objectContaining({ object }));
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'config');
    });

    it('should throw if getObject fails', async () => {
      mocks.storage.getObject.mockImplementation(() => new Promise((_, reject) => reject()));
      await expect(sut.getConfig(mockAuth())).rejects.toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should save config', async () => {
      const body = Readable.from('body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveConfig(mockAuth(), body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'config', expect.anything(), false);
    });

    it('should pass writeOnce flag', async () => {
      const body = Readable.from('body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveConfig(mockAuth(true), body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'config', expect.anything(), true);
    });

    it('should throw on 412 error', async () => {
      const body = Readable.from('body');
      const error = new S3ServiceException({
        name: 'PreconditionFailed',
        $fault: 'client',
        $metadata: { httpStatusCode: 412 },
      });
      mocks.storage.putObject.mockRejectedValue(error);
      await expect(sut.saveConfig(mockAuth(true), body as never)).rejects.toThrow('Config already exists');
    });

    it('should throw on other errors', async () => {
      mocks.storage.putObject.mockRejectedValue(new Error('other'));
      await expect(sut.saveConfig(mockAuth(), null as never)).rejects.toThrow();
    });
  });

  describe('deleteConfig', () => {
    it('should delete config', async () => {
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteConfig(mockAuth());
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'config');
    });

    it('should throw when writeOnce and not locks', async () => {
      await expect(sut.deleteConfig(mockAuth(true))).rejects.toThrow();
      expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw if deleteObject fails', async () => {
      mocks.storage.deleteObject.mockRejectedValue(void 0);
      await expect(sut.deleteConfig(mockAuth())).rejects.toThrow();
    });
  });

  describe('listBlobs', () => {
    it('should return mapped blobs', async () => {
      mocks.storage.listObjects.mockResolvedValue({
        Contents: [
          { Key: 'data/abc123', Size: 100 },
          { Key: 'data/def456', Size: 200 },
        ],
        KeyCount: 2,
        $metadata: void 0 as never,
      });

      const result = await sut.listBlobs(mockAuth(), BlobType.Data);
      expect(result).toEqual([
        { name: 'abc123', size: 100 },
        { name: 'def456', size: 200 },
      ]);
      expect(mocks.storage.listObjects).toHaveBeenCalledWith('repository', 'data/');
    });

    it('should return empty array when KeyCount is 0', async () => {
      mocks.storage.listObjects.mockResolvedValue({ KeyCount: 0, $metadata: void 0 as never });
      const result = await sut.listBlobs(mockAuth(), BlobType.Data);
      expect(result).toEqual([]);
    });

    it('should throw if Contents is undefined', async () => {
      mocks.storage.listObjects.mockResolvedValue({ KeyCount: 1, $metadata: void 0 as never });
      await expect(sut.listBlobs(mockAuth(), BlobType.Data)).rejects.toThrow();
    });

    it('should throw if Key or Size is missing', async () => {
      mocks.storage.listObjects.mockResolvedValue({
        Contents: [{ Key: 'data/abc123' }],
        KeyCount: 1,
        $metadata: void 0 as never,
      });

      await expect(sut.listBlobs(mockAuth(), BlobType.Data)).rejects.toThrow();
    });

    it('should throw if listObjects fails', async () => {
      mocks.storage.listObjects.mockRejectedValue(void 0);
      await expect(sut.listBlobs(mockAuth(), BlobType.Data)).rejects.toThrow();
    });
  });

  describe('checkBlob', () => {
    it('should return content length', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 456, $metadata: void 0 as never });
      const result = await sut.checkBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(result).toBe(456);
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'data/abc123');
    });

    it('should return 0 if content length is undefined', async () => {
      mocks.storage.headObject.mockResolvedValue({ $metadata: void 0 as never });
      const result = await sut.checkBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(result).toBe(0);
    });

    it('should throw if headObject fails', async () => {
      mocks.storage.headObject.mockRejectedValue(void 0);
      await expect(sut.checkBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
    });
  });

  describe('getBlob', () => {
    it('should return the object', async () => {
      const object = Symbol('Object');
      mocks.storage.getObject.mockResolvedValue(object as never);
      const result = await sut.getBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(result).toEqual(expect.objectContaining({ object }));
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'data/abc123', undefined);
    });

    it('should pass range to getObjectStream', async () => {
      const stream = Symbol('Stream');
      mocks.storage.getObject.mockResolvedValue(stream as never);
      await sut.getBlob(mockAuth(), BlobType.Data, 'abc123', 'bytes=0-100');
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'data/abc123', 'bytes=0-100');
    });

    it('should throw if getObject fails', async () => {
      mocks.storage.getObject.mockImplementation(() => new Promise((_, reject) => reject()));
      await expect(sut.getBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
    });
  });

  describe('saveBlob', () => {
    it('should save blob', async () => {
      const body = Readable.from('body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveBlob(mockAuth(), BlobType.Data, 'abc123', body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith(
        'repository',
        'data/abc123',
        expect.anything(),
        false,
        'abc123',
      );
    });

    it('should pass writeOnce flag', async () => {
      const body = Readable.from('body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveBlob(mockAuth(true), BlobType.Data, 'abc123', body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith(
        'repository',
        'data/abc123',
        expect.anything(),
        true,
        'abc123',
      );
    });

    it('should throw ConflictException on 412 error', async () => {
      const body = Readable.from('body');
      const error = new S3ServiceException({
        name: 'PreconditionFailed',
        $fault: 'client',
        $metadata: { httpStatusCode: 412 },
      });
      mocks.storage.putObject.mockRejectedValue(error);
      await expect(sut.saveBlob(mockAuth(true), BlobType.Data, 'abc123', body as never)).rejects.toThrow(
        'Blob already exists',
      );
    });

    it('should throw on other errors', async () => {
      mocks.storage.putObject.mockRejectedValue(new Error('other'));
      await expect(sut.saveBlob(mockAuth(), BlobType.Data, 'abc123', null as never)).rejects.toThrow();
    });
  });

  describe('deleteBlob', () => {
    it('should delete blob', async () => {
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'data/abc123');
    });

    it('should allow delete of locks with writeOnce', async () => {
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob(mockAuth(true), BlobType.Locks, 'abc123');
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'locks/abc123');
    });

    it('should throw when writeOnce and not locks', async () => {
      await expect(sut.deleteBlob(mockAuth(true), BlobType.Data, 'abc123')).rejects.toThrow();
      expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw if deleteObject fails', async () => {
      mocks.storage.deleteObject.mockRejectedValue(void 0);
      await expect(sut.deleteBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
    });
  });
});
