import { sdk } from '$lib';
import type {
  ScheduleCreateRequestDto,
  ScheduleUpdateRequestDto,
} from '$lib/fetch-client';
import { toastManager } from '@immich/ui';
import { handleError } from '$lib/utils/handle-error';

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
