import { S3ServiceException } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
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
    sut = new AppService(mocks.storage as never, mocks.metricService, mocks.wideContext);
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
      const S3Error = Symbol('S3Error');
      mocks.storage.checkBucket.mockRejectedValueOnce(S3Error);
      await expect(sut.createRepository('repository', true)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalledTimes(0);
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });

    it('should fail if S3 command throws', async () => {
      const S3Error = Symbol('S3Error');
      mocks.storage.createBucket.mockRejectedValueOnce(S3Error);
      await expect(sut.createRepository('repository', true)).rejects.toThrow();
      expect(mocks.storage.checkBucket).toHaveBeenCalled();
      expect(mocks.storage.createBucket).toHaveBeenCalled();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
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
      const S3Error = Symbol('S3Error');
      mocks.storage.headObject.mockRejectedValue(S3Error);
      await expect(sut.checkConfig(mockAuth())).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('getConfig', () => {
    it('should return the stream', async () => {
      const result = await sut.getConfig(mockAuth());
      expect(result).toEqual(
        expect.objectContaining({
          object: expect.objectContaining({
            ContentLength: expect.any(Number),
          }),
        }),
      );
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'config');

      const data = await text(result.stream()!);
      expect(data).toHaveLength(result.object.ContentLength!);
      expect(sut.blobsDownloadedBytes.add).toHaveBeenCalledWith(
        result.object.ContentLength,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsDownloadedBytes.add).toHaveBeenCalledTimes(1);
      expect(sut.blobsRequestedBytes.add).toHaveBeenCalledWith(
        result.object.ContentLength,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsRequestedBytes.add).toHaveBeenCalledTimes(1);
    });

    it('should throw if getObject fails', async () => {
      const S3Error = Symbol('S3Error');
      mocks.storage.getObject.mockImplementation(() => new Promise((_, reject) => reject(S3Error)));
      await expect(sut.getConfig(mockAuth())).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('saveConfig', () => {
    it('should save config', async () => {
      const body = Readable.from('body');
      await sut.saveConfig(mockAuth(), body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith('repository', 'config', expect.anything(), false);

      expect(sut.blobsUploadedBytes.add).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsUploadedBytes.add).toHaveBeenCalledTimes(1);
    });

    it('should pass writeOnce flag', async () => {
      const body = Readable.from('body');
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
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(error);
    });

    it('should throw on other errors', async () => {
      const body = Readable.from('body');
      const S3Error = Symbol('S3Error');
      mocks.storage.putObject.mockRejectedValue(S3Error);
      await expect(sut.saveConfig(mockAuth(), body as never)).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('deleteConfig', () => {
    it('should delete config', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 500, $metadata: void 0 as never });
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteConfig(mockAuth());
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'config');
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'config');
    });

    it('should throw when writeOnce and not locks', async () => {
      await expect(sut.deleteConfig(mockAuth(true))).rejects.toThrow();
      expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw if deleteObject fails', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 500, $metadata: void 0 as never });
      const S3Error = Symbol('S3Error');
      mocks.storage.deleteObject.mockRejectedValue(S3Error);
      await expect(sut.deleteConfig(mockAuth())).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
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
      const Contents = [{ Key: 'data/abc123' }];
      mocks.storage.listObjects.mockResolvedValue({
        Contents,
        KeyCount: 1,
        $metadata: void 0 as never,
      });

      await expect(sut.listBlobs(mockAuth(), BlobType.Data)).rejects.toThrow();
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('contents', Contents);
    });

    it('should throw if listObjects fails', async () => {
      const S3Error = Symbol('S3Error');
      mocks.storage.listObjects.mockRejectedValue(S3Error);
      await expect(sut.listBlobs(mockAuth(), BlobType.Data)).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
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
      const S3Error = Symbol('S3Error');
      mocks.storage.headObject.mockRejectedValue(S3Error);
      await expect(sut.checkBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('getBlob', () => {
    it('should return the object', async () => {
      const result = await sut.getBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(result).toEqual(
        expect.objectContaining({
          object: expect.objectContaining({
            ContentLength: expect.any(Number),
          }),
        }),
      );
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'data/abc123', undefined);

      const data = await text(result.stream()!);
      expect(data).toHaveLength(result.object.ContentLength!);
      expect(sut.blobsDownloadedBytes.add).toHaveBeenCalledWith(
        result.object.ContentLength,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsDownloadedBytes.add).toHaveBeenCalledTimes(1);
      expect(sut.blobsRequestedBytes.add).toHaveBeenCalledWith(
        result.object.ContentLength,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsRequestedBytes.add).toHaveBeenCalledTimes(1);
    });

    it('should pass range to getObjectStream', async () => {
      await sut.getBlob(mockAuth(), BlobType.Data, 'abc123', 'bytes=0-100');
      expect(mocks.storage.getObject).toHaveBeenCalledWith('repository', 'data/abc123', 'bytes=0-100');
    });

    it('should throw if getObject fails', async () => {
      const S3Error = Symbol('S3Error');
      mocks.storage.getObject.mockImplementation(() => new Promise((_, reject) => reject(S3Error)));
      await expect(sut.getBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('saveBlob', () => {
    it('should save blob', async () => {
      const body = Readable.from('body');
      await sut.saveBlob(mockAuth(), BlobType.Data, 'abc123', body as never);
      expect(mocks.storage.putObject).toHaveBeenCalledWith(
        'repository',
        'data/abc123',
        expect.anything(),
        true,
        'abc123',
      );

      expect(sut.blobsUploadedBytes.add).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          customerId: 'user',
          repositoryId: 'repository',
        }),
      );
      expect(sut.blobsUploadedBytes.add).toHaveBeenCalledTimes(1);
    });

    it('should pass writeOnce flag', async () => {
      const body = Readable.from('body');
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
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(error);
    });

    it('should throw on other errors', async () => {
      const body = Readable.from('body');
      const S3Error = Symbol('S3Error');
      mocks.storage.putObject.mockRejectedValue(S3Error);
      await expect(sut.saveBlob(mockAuth(), BlobType.Data, 'abc123', body as never)).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });

  describe('deleteBlob', () => {
    it('should delete blob', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 500, $metadata: void 0 as never });
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob(mockAuth(), BlobType.Data, 'abc123');
      expect(mocks.storage.headObject).toHaveBeenCalledWith('repository', 'data/abc123');
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'data/abc123');
    });

    it('should allow delete of locks with writeOnce', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 500, $metadata: void 0 as never });
      mocks.storage.deleteObject.mockResolvedValue(void 0 as never);
      await sut.deleteBlob(mockAuth(true), BlobType.Locks, 'abc123');
      expect(mocks.storage.deleteObject).toHaveBeenCalledWith('repository', 'locks/abc123');
    });

    it('should throw when writeOnce and not locks', async () => {
      await expect(sut.deleteBlob(mockAuth(true), BlobType.Data, 'abc123')).rejects.toThrow();
      expect(mocks.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('should throw if deleteObject fails', async () => {
      mocks.storage.headObject.mockResolvedValue({ ContentLength: 500, $metadata: void 0 as never });
      const S3Error = Symbol('S3Error');
      mocks.storage.deleteObject.mockRejectedValue(S3Error);
      await expect(sut.deleteBlob(mockAuth(), BlobType.Data, 'abc123')).rejects.toThrow();
      expect(mocks.wideContext.setErrorCause).toHaveBeenCalledWith(S3Error);
    });
  });
});
