import { EventEmitter } from 'node:events';
import { ResticProxy, UNTHROTTLED } from './resticProxy';
import { ResticProxyPool } from './resticProxyPool';

type FakeProxy = {
  process: EventEmitter;
  throttle: jest.Mock;
  stop: jest.Mock;
};

const newFakeProxy = (): FakeProxy => ({
  process: new EventEmitter(),
  throttle: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
});

describe(ResticProxyPool.name, () => {
  const apiUrl = 'https://yucca.test/api';
  const throttle = { bytesPerSec: 1000, quietHours: '01:00-02:00' };

  let create: jest.SpyInstance;

  beforeEach(() => {
    ResticProxyPool.pool = new Map();
    ResticProxyPool.available = undefined;
    ResticProxyPool.throttle = UNTHROTTLED;
    create = jest.spyOn(ResticProxy, 'create').mockImplementation(() => Promise.resolve(newFakeProxy() as never));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getProxy', () => {
    it('creates a proxy with the current throttle', async () => {
      ResticProxyPool.throttle = throttle;

      await new ResticProxyPool().getProxy(apiUrl);

      expect(create).toHaveBeenCalledWith(apiUrl, throttle);
    });

    it('returns the same pending proxy to concurrent callers', () => {
      const pool = new ResticProxyPool();

      const first = pool.getProxy(apiUrl);
      const second = pool.getProxy(apiUrl);

      expect(second).toBe(first);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('creates a fresh proxy after the pooled one exits', async () => {
      const pool = new ResticProxyPool();
      const exited = await pool.getProxy(apiUrl);

      exited.process.emit('exit');
      const replacement = await pool.getProxy(apiUrl);

      expect(replacement).not.toBe(exited);
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('retries after a proxy fails to start', async () => {
      const pool = new ResticProxyPool();
      create.mockRejectedValueOnce(new Error('restic-proxy did not report an address'));

      await expect(pool.getProxy(apiUrl)).rejects.toThrow('restic-proxy did not report an address');
      await expect(pool.getProxy(apiUrl)).resolves.toBeDefined();

      expect(create).toHaveBeenCalledTimes(2);
    });
  });

  describe('onModuleConfigUpdate', () => {
    it('pushes the new throttle to every running proxy', async () => {
      const pool = new ResticProxyPool();
      const first = await pool.getProxy(apiUrl);
      const second = await pool.getProxy('https://other.test/api');

      await pool.onModuleConfigUpdate({ statePath: '/state', throttle });

      expect(ResticProxyPool.throttle).toEqual(throttle);
      expect(first.throttle).toHaveBeenCalledWith(throttle);
      expect(second.throttle).toHaveBeenCalledWith(throttle);
    });

    it('unthrottles every running proxy when the throttle is removed', async () => {
      const pool = new ResticProxyPool();
      ResticProxyPool.throttle = throttle;
      const running = await pool.getProxy(apiUrl);

      await pool.onModuleConfigUpdate({ statePath: '/state' });

      expect(ResticProxyPool.throttle).toEqual(UNTHROTTLED);
      expect(running.throttle).toHaveBeenCalledWith(UNTHROTTLED);
    });
  });

  describe('onApplicationShutdown', () => {
    it('stops every running proxy', async () => {
      const pool = new ResticProxyPool();
      const first = await pool.getProxy(apiUrl);
      const second = await pool.getProxy('https://other.test/api');
      create.mockRejectedValueOnce(new Error('restic-proxy did not report an address'));
      const failed = pool.getProxy('https://failed.test/api');

      await pool.onApplicationShutdown();

      await expect(failed).rejects.toThrow();
      expect(first.stop).toHaveBeenCalled();
      expect(second.stop).toHaveBeenCalled();
    });
  });
});
