import { sdk } from '$lib';
import {
  getSchedules,
  type ScheduleCreateRequestDto,
  type ScheduleDto,
  type ScheduleUpdateRequestDto,
} from '$lib/fetch-client';
import { SocketEvent } from '$lib/events';
import { toastManager } from '@immich/ui';
import { handleError } from '$lib/utils/handle-error';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';

export const scheduleKeys = {
  all: ['schedules'] as const,
};

export const useSchedules = () =>
  createQuery(() => ({
    queryKey: scheduleKeys.all,
    queryFn: () => getSchedules().then(({ schedules }) => schedules),
  }));

export const useScheduleEventHandler = () => {
  const queryClient = useQueryClient();

  return {
    onScheduleCreate(event: SocketEvent<{ schedule: ScheduleDto }>) {
      queryClient.setQueryData(
        scheduleKeys.all,
        (data: ScheduleDto[] | undefined) => {
          return data ? [...data, event.data.schedule] : void 0;
        },
      );
    },
    onScheduleUpdate(
      event: SocketEvent<{
        scheduleId: string;
        schedule: Partial<ScheduleDto>;
      }>,
    ) {
      queryClient.setQueryData(
        scheduleKeys.all,
        (data: ScheduleDto[] | undefined) => {
          return data
            ? data.map((entry) =>
                entry.id === event.data.scheduleId
                  ? { ...entry, ...event.data.schedule }
                  : entry,
              )
            : void 0;
        },
      );
    },
    onScheduleDelete(event: SocketEvent<{ scheduleId: string }>) {
      queryClient.setQueryData(
        scheduleKeys.all,
        (data: ScheduleDto[] | undefined) => {
          return data
            ? data.filter((entry) => entry.id !== event.data.scheduleId)
            : void 0;
        },
      );
    },
  };
};

export const handleGetSchedules = async () => {
  try {
    return await sdk.getSchedules();
  } catch (error) {
    handleError(error, 'Failed to load schedules');
    throw error;
  }
};

export const handleCreateSchedule = async (dto: ScheduleCreateRequestDto) => {
  try {
    return await sdk.createSchedule(dto);
  } catch (error) {
    handleError(error, 'Failed to create schedule');
    throw error;
  }
};

export const handleUpdateSchedule = async (
  id: string,
  dto: ScheduleUpdateRequestDto,
) => {
  try {
    await sdk.updateSchedule(id, dto);
  } catch (error) {
    handleError(error, 'Failed to update schedule');
    throw error;
  }
};

export const handlePauseSchedule = async (id: string, name: string) => {
  try {
    await sdk.updateSchedule(id, { paused: true });
    toastManager.info(`Paused schedule "${name}"`);
  } catch (error) {
    handleError(error, 'Failed to pause schedule');
    throw error;
  }
};

export const handleResumeSchedule = async (id: string, name: string) => {
  try {
    await sdk.updateSchedule(id, { paused: false });
    toastManager.success(`Resumed schedule "${name}"`);
  } catch (error) {
    handleError(error, 'Failed to resume schedule');
    throw error;
  }
};

export const handleRemoveSchedule = async (id: string, name: string) => {
  try {
    await sdk.removeSchedule(id);
    toastManager.info(`Deleted schedule "${name}"`);
  } catch (error) {
    handleError(error, 'Failed to delete schedule');
    throw error;
  }
};
