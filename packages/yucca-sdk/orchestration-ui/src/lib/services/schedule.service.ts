import { sdk } from '$lib';
import ConfigureScheduleModal from '$lib/components/schedules/dialogs/ConfigureScheduleModal.svelte';
import {
  getSchedules,
  type ScheduleCreateRequestDto,
  type ScheduleDto,
  type ScheduleUpdateRequestDto,
} from '$lib/fetch-client';
import { SocketEvent } from '$lib/events';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import { mdiCog, mdiDelete, mdiPause, mdiPlay } from '@mdi/js';
import { handleError } from '$lib/utils/handle-error';
import { queryClient } from '$lib/query-client';
import { createMutation, createQuery } from '@tanstack/svelte-query';
import { gt, msg } from 'svelte-i18n-lingui';

export const scheduleKeys = {
  all: ['schedules'] as const,
};

export const useSchedules = () =>
  createQuery(
    () => ({
      queryKey: scheduleKeys.all,
      queryFn: () => getSchedules().then(({ schedules }) => schedules),
    }),
    () => queryClient,
  );

export const useScheduleEventHandler = () => {
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
    handleError(error, gt`Failed to load schedules`);
    throw error;
  }
};

export const useCreateSchedule = () =>
  createMutation(
    () => ({
      mutationFn: (dto: ScheduleCreateRequestDto) => sdk.createSchedule(dto),
      onError: (error) => handleError(error, gt`Failed to create schedule`),
    }),
    () => queryClient,
  );

export const useUpdateSchedule = () =>
  createMutation(
    () => ({
      mutationFn: ({
        id,
        dto,
      }: {
        id: string;
        dto: ScheduleUpdateRequestDto;
      }) => sdk.updateSchedule(id, dto),
      onError: (error) => handleError(error, gt`Failed to update schedule`),
    }),
    () => queryClient,
  );

export const handlePauseSchedule = async (id: string, name: string) => {
  try {
    await sdk.updateSchedule(id, { paused: true });
    toastManager.info(
      gt({ message: 'Paused schedule "{name}"', values: { name } }),
    );
  } catch (error) {
    handleError(error, gt`Failed to pause schedule`);
    throw error;
  }
};

export const handleResumeSchedule = async (id: string, name: string) => {
  try {
    await sdk.updateSchedule(id, { paused: false });
    toastManager.success(
      gt({ message: 'Resumed schedule "{name}"', values: { name } }),
    );
  } catch (error) {
    handleError(error, gt`Failed to resume schedule`);
    throw error;
  }
};

export const handleRemoveSchedule = async (id: string, name: string) => {
  try {
    await sdk.removeSchedule(id);
    toastManager.info(
      gt({ message: 'Deleted schedule "{name}"', values: { name } }),
    );
  } catch (error) {
    handleError(error, gt`Failed to delete schedule`);
    throw error;
  }
};

export const getScheduleActions = (schedule: ScheduleDto, t: typeof gt) => {
  const Resume: ActionItem = {
    title: t(msg`Resume`),
    icon: mdiPlay,
    onAction: () => void handleResumeSchedule(schedule.id, schedule.name),
    $if: () => schedule.paused,
  };

  const Pause: ActionItem = {
    title: t(msg`Pause`),
    icon: mdiPause,
    onAction: () => void handlePauseSchedule(schedule.id, schedule.name),
    $if: () => !schedule.paused,
  };

  const Configure: ActionItem = {
    title: t(msg`Configure`),
    icon: mdiCog,
    onAction: () =>
      void modalManager.open(ConfigureScheduleModal, { schedule }),
  };

  const Delete: ActionItem = {
    title: t(msg`Delete`),
    icon: mdiDelete,
    color: 'danger',
    onAction: async () => {
      const confirm = await modalManager.showDialog({
        confirmText: t(msg`Delete`),
        title: t(msg`Delete Schedule`),
        prompt: t(msg`This schedule will be removed.`),
      });

      if (!confirm) {
        return;
      }

      await handleRemoveSchedule(schedule.id, schedule.name);
    },
  };

  return { Resume, Pause, Configure, Delete };
};
