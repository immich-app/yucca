import { createResticUrl } from '@futo-org/backups-api-client';
import { BackendType } from '../enum';
import { ResticProxy } from '../proxy/resticProxy';
import { ResticProxyPool } from '../proxy/resticProxyPool';
import { LoggingRepository } from '../repositories/logging.repository';
import { YuccaBackend } from './yucca.backend';

jest.mock('@futo-org/backups-api-client', () => ({ createResticUrl: jest.fn() }));

function newBackend() {
  return new YuccaBackend({ type: BackendType.Yucca, url: 'https://yucca.test', accessToken: 'access-token' });
}

describe(YuccaBackend.name, () => {
  const proxy = { createUrl: jest.fn(ResticProxy.prototype.createUrl), address: '127.0.0.1:4000' };

  beforeEach(() => {
    jest.mocked(createResticUrl).mockResolvedValue({ url: 'rest:https://direct.test/repository-id' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(createResticUrl).mockReset();
    proxy.createUrl.mockClear();
  });

  describe('getResticEndpoint', () => {
    it('returns a proxy URL when the proxy is available', async () => {
      jest.spyOn(ResticProxyPool.prototype, 'isAvailable').mockResolvedValue(true);
      const getProxy = jest
        .spyOn(ResticProxyPool.prototype, 'getProxy')
        .mockResolvedValue(proxy as unknown as ResticProxy);

      await expect(newBackend().getResticEndpoint('repository-id')).resolves.toEqual(
        'rest:http://repository-id:access-token@127.0.0.1:4000',
      );

      expect(getProxy).toHaveBeenCalledWith('https://yucca.test/api');
      expect(proxy.createUrl).toHaveBeenCalledWith('repository-id', 'access-token');
      expect(createResticUrl).not.toHaveBeenCalled();
    });

    it('falls back to a direct URL and warns when the proxy fails to start', async () => {
      const failure = new Error('restic-proxy did not report an address');
      jest.spyOn(ResticProxyPool.prototype, 'isAvailable').mockResolvedValue(true);
      jest.spyOn(ResticProxyPool.prototype, 'getProxy').mockRejectedValue(failure);
      const warn = jest.spyOn(LoggingRepository.prototype, 'warn').mockImplementation(() => {});

      await expect(newBackend().getResticEndpoint('repository-id')).resolves.toEqual(
        'rest:https://direct.test/repository-id',
      );

      expect(createResticUrl).toHaveBeenCalledWith(
        'repository-id',
        expect.objectContaining({ baseUrl: 'https://yucca.test' }),
      );
      expect(warn).toHaveBeenCalledWith('Falling back to a direct restic URL', failure);
    });

    it('uses a direct URL without asking for a proxy when the proxy is unavailable', async () => {
      jest.spyOn(ResticProxyPool.prototype, 'isAvailable').mockResolvedValue(false);
      const getProxy = jest.spyOn(ResticProxyPool.prototype, 'getProxy');

      await expect(newBackend().getResticEndpoint('repository-id')).resolves.toEqual(
        'rest:https://direct.test/repository-id',
      );

      expect(createResticUrl).toHaveBeenCalledWith(
        'repository-id',
        expect.objectContaining({ baseUrl: 'https://yucca.test' }),
      );
      expect(getProxy).not.toHaveBeenCalled();
    });
  });
});
