import { updateConfig, type ConfigResponseDto } from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import {
  configKeys,
  toBandwidthDto,
  toBandwidthForm,
  useUpdateConfig,
} from '$lib/services/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/fetch-client');

describe('toBandwidthForm', () => {
  it('reads the limit and quiet hours from the saved config', () => {
    expect(
      toBandwidthForm({ bytesPerSec: 5_000_000, quietHours: '23:00-07:00' }),
    ).toEqual({
      speed: '5000000',
      quiet: true,
      quietStart: '23:00',
      quietEnd: '07:00',
    });
  });

  it('falls back to the default quiet hours when none are saved', () => {
    expect(toBandwidthForm({ bytesPerSec: 0 })).toEqual({
      speed: '0',
      quiet: false,
      quietStart: '22:00',
      quietEnd: '06:00',
    });
  });
});

describe('toBandwidthDto', () => {
  it('converts the selected speed to bytes per second with quiet hours', () => {
    expect(
      toBandwidthDto({
        speed: '500000',
        quiet: true,
        quietStart: '22:00',
        quietEnd: '06:00',
      }),
    ).toEqual({ bytesPerSec: 500_000, quietHours: '22:00-06:00' });
  });

  it('clears quiet hours when they are switched off', () => {
    expect(
      toBandwidthDto({
        speed: '2000000',
        quiet: false,
        quietStart: '22:00',
        quietEnd: '06:00',
      }),
    ).toEqual({ bytesPerSec: 2_000_000, quietHours: undefined });
  });

  it('disables the limit and drops quiet hours when set to no limit', () => {
    expect(
      toBandwidthDto({
        speed: '0',
        quiet: true,
        quietStart: '22:00',
        quietEnd: '06:00',
      }),
    ).toEqual({ bytesPerSec: 0, quietHours: undefined });
  });

  it('round trips a saved config', () => {
    const bandwidth = { bytesPerSec: 10_000_000, quietHours: '01:00-05:00' };

    expect(toBandwidthDto(toBandwidthForm(bandwidth))).toEqual(bandwidth);
  });
});

describe('useUpdateConfig', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('sends the bandwidth through the SDK and caches the saved config', async () => {
    const saved: ConfigResponseDto = {
      bandwidth: { bytesPerSec: 1_000_000, quietHours: '22:00-06:00' },
    };
    vi.mocked(updateConfig).mockResolvedValue(saved);

    useUpdateConfig().mutate({
      bandwidth: toBandwidthDto({
        speed: '1000000',
        quiet: true,
        quietStart: '22:00',
        quietEnd: '06:00',
      }),
    });

    await vi.waitFor(() =>
      expect(queryClient.getQueryData(configKeys.all)).toEqual(saved),
    );
    expect(updateConfig).toHaveBeenCalledWith(saved);
  });

  it('sends a zero limit without quiet hours to disable throttling', async () => {
    const saved: ConfigResponseDto = { bandwidth: { bytesPerSec: 0 } };
    vi.mocked(updateConfig).mockResolvedValue(saved);

    useUpdateConfig().mutate({
      bandwidth: toBandwidthDto({
        speed: '0',
        quiet: true,
        quietStart: '22:00',
        quietEnd: '06:00',
      }),
    });

    await vi.waitFor(() =>
      expect(queryClient.getQueryData(configKeys.all)).toEqual(saved),
    );
    expect(updateConfig).toHaveBeenCalledWith({
      bandwidth: { bytesPerSec: 0, quietHours: undefined },
    });
  });
});
