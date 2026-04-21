import { defaults } from '$lib/fetch-client';
import debounce from 'lodash.debounce';

type LogEvent =
  | { message_type: 'summary' }
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
    };

const formatErrorEvent = (event: LogEvent & { message_type: 'error' }): string => {
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
  const state = $state<{ status: LogStatus; errors: string[]; events: LogEvent[] }>({
    status: {
      progress: 0,
      text: '',
      currentFiles: [],
    },
    errors: [],
    events: [],
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
    buffer.unshift(event);
    buffer.splice(50);

    switch (event.message_type) {
      case 'status': {
        state.status = {
          progress: event.percent_done,
          text: event.seconds_remaining
            ? `${event.seconds_remaining} seconds remaining`
            : '',
          currentFiles: event.current_files ?? [],
        };
        flush();
        break;
      }
      case 'summary': {
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
        state.errors.push(`restic exited with code ${event.code}: ${event.message}`);
        flush();
        flush.flush();
        break;
      }
    }
  };

  const source = new EventSource(
    new URL(`/api/yucca/logs/${logId}`, defaults.baseUrl),
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
    destroy() {
      flush.cancel();
      source.close();
    },
  };
}
