import { S3ServiceException } from '@aws-sdk/client-s3';
import { type Mocks, newMocks } from '../../test/mocks';
import { AppService } from './app.service';

describe(AppService.name, () => {
  let mocks: Mocks;
  let sut: AppService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AppService(mocks.logger as never, mocks.storage as never);
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
      const result = await sut.checkConfig('repository');
      expect(result).toBe(123);
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'config');
    });

    it('should return 0 if content length is undefined', async () => {
      mocks.storage.headObject.mockResolvedValue({ $metadata: void 0 as never });
      const result = await sut.checkConfig('repository');
      expect(result).toBe(0);
    });

    it('should throw if headObject fails', async () => {
      mocks.storage.headObject.mockRejectedValue(void 0);
      await expect(sut.checkConfig('repository')).rejects.toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return the stream', async () => {
      const stream = Symbol('Stream');
      mocks.storage.getObjectStream.mockResolvedValue(stream as never);
      const result = await sut.getConfig('repository');
      expect(result).toBe(stream);
      expect(mocks.storage.getObjectStream).toHaveBeenCalledWith('repository', 'config');
    });

    it('should throw if stream is falsy', async () => {
      mocks.storage.getObjectStream.mockResolvedValue(null as never);
      await expect(sut.getConfig('repository')).rejects.toThrow();
    });

    it('should throw if getObjectStream fails', async () => {
      mocks.storage.getObjectStream.mockRejectedValue(void 0);
      await expect(sut.getConfig('repository')).rejects.toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should save config', async () => {
      const body = Symbol('Body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveConfig('repository', body as never, false);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'config', body, false);
    });

    it('should pass writeOnce flag', async () => {
      const body = Symbol('Body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveConfig('repository', body as never, true);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'config', body, true);
    });

    it('should throw ConflictException on 412 error', async () => {
      const error = new S3ServiceException({
        name: 'PreconditionFailed',
        $fault: 'client',
        $metadata: { httpStatusCode: 412 },
      });
      mocks.storage.putObject.mockRejectedValue(error);
      await expect(sut.saveConfig('repository', null as never, true)).rejects.toThrow('Config already exists');
    });

    it('should throw on other errors', async () => {
      mocks.storage.putObject.mockRejectedValue(new Error('other'));
      await expect(sut.saveConfig('repository', null as never, false)).rejects.toThrow();
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

      const result = await sut.listBlobs('repository', 'data');
      expect(result).toEqual([
        { name: 'abc123', size: 100 },
        { name: 'def456', size: 200 },
      ]);
      expect(mocks.storage.listObjects).toHaveBeenCalledWith('repository', 'data/');
    });

    it('should return empty array when KeyCount is 0', async () => {
      mocks.storage.listObjects.mockResolvedValue({ KeyCount: 0, $metadata: void 0 as never });
      const result = await sut.listBlobs('repository', 'data');
      expect(result).toEqual([]);
    });

    it('should throw if Contents is undefined', async () => {
      mocks.storage.listObjects.mockResolvedValue({ KeyCount: 1, $metadata: void 0 as never });
      await expect(sut.listBlobs('repository', 'data')).rejects.toThrow();
    });

    it('should throw if Key or Size is missing', async () => {
      mocks.storage.listObjects.mockResolvedValue({
        Contents: [{ Key: 'data/abc123' }],
        KeyCount: 1,
        $metadata: void 0 as never,
      });

      await expect(sut.listBlobs('repository', 'data')).rejects.toThrow();
    });

    it('should throw if listObjects fails', async () => {
      mocks.storage.listObjects.mockRejectedValue(void 0);
      await expect(sut.listBlobs('repository', 'data')).rejects.toThrow();
    });
  });

  describe('checkBlob', () => {
    it('should return content length', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 456, $metadata: void 0 as never });
      const result = await sut.checkBlob('repository', 'data', 'abc123');
      expect(result).toBe(456);
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'data/abc123');
    });

    it('should return 0 if content length is undefined', async () => {
      mocks.storage.headObject.mockResolvedValue({ $metadata: void 0 as never });
      const result = await sut.checkBlob('repository', 'data', 'abc123');
      expect(result).toBe(0);
    });

    it('should throw if headObject fails', async () => {
      mocks.storage.headObject.mockRejectedValue(void 0);
      await expect(sut.checkBlob('repository', 'data', 'abc123')).rejects.toThrow();
    });
  });

  describe('getBlob', () => {
    it('should return the stream', async () => {
      const stream = Symbol('Stream');
      mocks.storage.getObjectStream.mockResolvedValue(stream as never);
      const result = await sut.getBlob('repository', 'data', 'abc123');
      expect(result).toBe(stream);
      expect(mocks.storage.getObjectStream).toHaveBeenCalledWith('repository', 'data/abc123', undefined);
    });

    it('should pass range to getObjectStream', async () => {
      const stream = Symbol('Stream');
      mocks.storage.getObjectStream.mockResolvedValue(stream as never);
      await sut.getBlob('repository', 'data', 'abc123', 'bytes=0-100');
      expect(mocks.storage.getObjectStream).toHaveBeenCalledWith('repository', 'data/abc123', 'bytes=0-100');
    });

    it('should throw if stream is falsy', async () => {
      mocks.storage.getObjectStream.mockResolvedValue(null as never);
      await expect(sut.getBlob('repository', 'data', 'abc123')).rejects.toThrow();
    });

    it('should throw if getObjectStream fails', async () => {
      mocks.storage.getObjectStream.mockRejectedValue(void 0);
      await expect(sut.getBlob('repository', 'data', 'abc123')).rejects.toThrow();
    });
  });

  describe('saveBlob', () => {
    it('should save blob', async () => {
      const body = Symbol('Body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveBlob('repository', 'data', 'abc123', body as never, false);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'data/abc123', body, false);
    });

    it('should pass writeOnce flag', async () => {
      const body = Symbol('Body');
      mocks.storage.putObject.mockResolvedValue(void 0 as never);
      await sut.saveBlob('repository', 'data', 'abc123', body as never, true);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'data/abc123', body, true);
    });

    it('should throw ConflictException on 412 error', async () => {
      const error = new S3ServiceException({
        name: 'PreconditionFailed',
        $fault: 'client',
        $metadata: { httpStatusCode: 412 },
      });
      mocks.storage.putObject.mockRejectedValue(error);
      await expect(sut.saveBlob('repository', 'data', 'abc123', null as never, true)).rejects.toThrow(
        'Blob already exists',
      );
    });

    it('should throw on other errors', async () => {
      mocks.storage.putObject.mockRejectedValue(new Error('other'));
      await expect(sut.saveBlob('repository', 'data', 'abc123', null as never, false)).rejects.toThrow();
    });
  });

  describe('deleteBlob', () => {
    it('should delete blob', async () => {
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob('repository', 'data', 'abc123', false);
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'data/abc123');
    });

    it('should allow delete of locks with writeOnce', async () => {
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob('repository', 'locks', 'abc123', true);
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'locks/abc123');
    });

    it('should throw MethodNotAllowedException when writeOnce and not locks', async () => {
      await expect(sut.deleteBlob('repository', 'data', 'abc123', true)).rejects.toThrow();
      expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw if deleteObject fails', async () => {
      mocks.storage.deleteObject.mockRejectedValue(void 0);
      await expect(sut.deleteBlob('repository', 'data', 'abc123', false)).rejects.toThrow();
    });
  });
});
