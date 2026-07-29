import { MetricsService } from './metrics.service';

const bucketStats = (entries: Array<{ bucket: string; bytes: number; objects: number }>) =>
  (async function* () {
    yield* await Promise.resolve(entries);
  })();

describe(MetricsService.name, () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const meter = { record: jest.fn() };
  const repositories = { getAll: jest.fn() };
  const sizeGauge = { record: jest.fn() };
  const objectGauge = { record: jest.fn() };
  const metricService = {
    getGauge: jest.fn((name: string) => (name === 'rgw_repository_size_bytes' ? sizeGauge : objectGauge)),
  };

  const connectionMetrics = {
    getRollups: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a bucket only from its assigned site and cluster', async () => {
    repositories.getAll.mockResolvedValue([
      {
        id: 'repository-1',
        userId: 'customer-1',
        siteCode: 'luke',
        storageClusterCode: 'luke-sietch',
      },
    ]);
    const fleet = {
      clusters: () => [
        {
          siteCode: 'father',
          clusterCode: 'father-spice',
          rgw: {
            getBucketStats: () => bucketStats([{ bucket: 'repository-1', bytes: 100, objects: 10 }]),
          },
        },
        {
          siteCode: 'luke',
          clusterCode: 'luke-sietch',
          rgw: {
            getBucketStats: () => bucketStats([{ bucket: 'repository-1', bytes: 200, objects: 20 }]),
          },
        },
      ],
    };

    const service = new MetricsService(
      logger as never,
      fleet as never,
      meter as never,
      repositories as never,
      connectionMetrics as never,
      metricService as never,
    );
    await service.sync();

    expect(meter.record).toHaveBeenCalledTimes(1);
    expect(meter.record).toHaveBeenCalledWith('repository-1', {
      sizeBytes: 200,
      objectCount: 20,
      storageClusterCode: 'luke-sietch',
    });
    expect(sizeGauge.record).toHaveBeenCalledWith(200, {
      repositoryId: 'repository-1',
      customerId: 'customer-1',
      site: 'luke',
      cluster: 'luke-sietch',
    });
    expect(objectGauge.record).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('assigned to luke/luke-sietch'));
  });

  it('does not erase meters when repository placement cannot be loaded', async () => {
    repositories.getAll.mockRejectedValue(new Error('database unavailable'));
    const fleet = { clusters: jest.fn() };
    const service = new MetricsService(
      logger as never,
      fleet as never,
      meter as never,
      repositories as never,
      connectionMetrics as never,
      metricService as never,
    );

    await service.sync();

    expect(fleet.clusters).not.toHaveBeenCalled();
    expect(meter.record).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), 'Failed to list repositories; skipping sync');
  });
});
