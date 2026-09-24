import ImmichDatabaseDumpAlert from '$lib/components/integrations/immich/ImmichDatabaseDumpAlert.svelte';
import {
  ignoreImmichDatabaseDumpWarning,
  type ImmichBackupStatusDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import {
  immichBackupStatusKeys,
  useIgnoreImmichDatabaseDumpWarning,
} from '$lib/services/immich.integration.service';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/fetch-client');

const schedule = {
  id: 'schedule',
  name: 'Immich',
  paused: false,
  cron: '0 2 * * *',
  repositories: [],
};

const status = (
  overrides: Partial<ImmichBackupStatusDto> = {},
): ImmichBackupStatusDto => ({
  databaseDump: { enabled: true, keepLastAmount: 14 },
  schedule,
  ...overrides,
});

const isRendered = () => {
  const { body } = render(ImmichDatabaseDumpAlert);

  return body.replaceAll(/<!--.*?-->/g, '') !== '';
};

const isAlertShown = (backupStatus: ImmichBackupStatusDto) => {
  queryClient.setQueryData(immichBackupStatusKeys.all, backupStatus);

  return isRendered();
};

describe('ImmichDatabaseDumpAlert', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('shows while Immich database dumps are enabled and not ignored', () => {
    expect(isAlertShown(status())).toBe(true);
  });

  it('hides once the warning has been ignored', () => {
    expect(isAlertShown(status({ databaseDumpWarningIgnored: true }))).toBe(
      false,
    );
  });

  it('hides when Immich database dumps are disabled', () => {
    expect(
      isAlertShown(
        status({ databaseDump: { enabled: false, keepLastAmount: 14 } }),
      ),
    ).toBe(false);
  });

  it('hides while the backup schedule is paused', () => {
    expect(
      isAlertShown(status({ schedule: { ...schedule, paused: true } })),
    ).toBe(false);
  });

  it('ignoring the warning calls the SDK and hides the alert', async () => {
    expect(isAlertShown(status())).toBe(true);

    useIgnoreImmichDatabaseDumpWarning().mutate();

    await vi.waitFor(() =>
      expect(
        queryClient.getQueryData<ImmichBackupStatusDto>(
          immichBackupStatusKeys.all,
        )?.databaseDumpWarningIgnored,
      ).toBe(true),
    );
    expect(ignoreImmichDatabaseDumpWarning).toHaveBeenCalledOnce();

    expect(isRendered()).toBe(false);
  });
});
