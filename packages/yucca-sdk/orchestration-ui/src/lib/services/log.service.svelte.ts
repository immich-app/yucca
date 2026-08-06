import { defaults } from '$lib/fetch-client';
import { formatDuration } from '$lib/utils/format';
import debounce from 'lodash.debounce';

type SummaryEvent = {
  message_type: 'summary';
  files_new?: number;
  files_changed?: number;
  files_unmodified?: number;
  data_added?: number;
  total_files_processed?: number;
  total_bytes_processed?: number;
  total_duration?: number;
  snapshot_id?: string;
  files_restored?: number;
  files_skipped?: number;
  files_deleted?: number;
  total_files?: number;
  bytes_restored?: number;
  bytes_skipped?: number;
  total_bytes?: number;
  seconds_elapsed?: number;
};

type LogEvent =
  | SummaryEvent
  | {
      message_type: 'error';
      error?: string | { message: string };
      message?: string;
      during?: string;
      item?: string;
    }
  | { message_type: 'exit_error'; code: number; message: string }
  | { message_type: 'raw'; message: string }
  | {
      message_type: 'status';
      percent_done: number;
      seconds_remaining?: number;
      current_files?: string[];
      bytes_done?: number;
      total_bytes?: number;
    };

const formatErrorEvent = (
  event: LogEvent & { message_type: 'error' },
): string => {
  const text =
    (typeof event.error === 'string' ? event.error : event.error?.message) ??
    event.message ??
    'Unknown error';
  const context = [event.during, event.item].filter(Boolean).join(' ');
  return context ? `${context}: ${text}` : text;
};

export type LogStatus = {
  progress: number;
  text: string;
  currentFiles: string[];
};

export function createLogObserver(logId: string) {
  const state = $state<{
    status: LogStatus;
    errors: string[];
    events: LogEvent[];
    summary: SummaryEvent | undefined;
  }>({
    status: {
      progress: 0,
      text: '',
      currentFiles: [],
    },
    errors: [],
    events: [],
    summary: undefined,
  });

  const buffer: LogEvent[] = [];

  const flush = debounce(
    () => {
      state.status = { ...state.status };
      state.errors = [...state.errors];
      state.events = buffer.slice();
    },
    50,
    { maxWait: 100 },
  );

  const onEvent = (event: LogEvent) => {
    if (event.message_type !== 'status') {
      buffer.unshift(event);
      buffer.splice(50);
    }

    switch (event.message_type) {
      case 'status': {
        state.status = {
          progress: event.percent_done,
          text:
            event.seconds_remaining &&
            (event.bytes_done && event.total_bytes
              ? event.bytes_done < event.total_bytes
              : event.percent_done < 100)
              ? `${formatDuration(event.seconds_remaining * 1000)} remaining`
              : 'Nearly done.',
          currentFiles: event.current_files ?? [],
        };
        flush();
        break;
      }
      case 'summary': {
        state.summary = event;
        state.status = {
          progress: 1,
          text: '',
          currentFiles: [],
        };
        flush();
        flush.flush();
        break;
      }
      case 'error': {
        state.errors.push(formatErrorEvent(event));
        flush();
        flush.flush();
        break;
      }
      case 'exit_error': {
        state.errors.push(
          `restic exited with code ${event.code}: ${event.message}`,
        );
        flush();
        flush.flush();
        break;
      }
      default: {
        flush();
        break;
      }
    }
  };

  const source = new EventSource(
    new URL(`/api/yucca/logs/${logId}/stream`, defaults.baseUrl),
  );
  source.addEventListener('message', ({ data }) => onEvent(JSON.parse(data)));

  return {
    get status() {
      return state.status;
    },
    get errors() {
      return state.errors;
    },
    get events() {
      return state.events;
    },
    get summary() {
      return state.summary;
    },
    destroy() {
      flush.cancel();
      source.close();
    },
  };
}
