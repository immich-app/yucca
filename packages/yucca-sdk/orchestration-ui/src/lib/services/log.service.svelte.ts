import { defaults } from '$lib/fetch-client';
import debounce from 'lodash.debounce';

type LogEvent =
  | { message_type: 'summary' }
  | {
      message_type: 'status';
      percent_done: number;
      seconds_remaining?: number;
      current_files?: string[];
    };

export type LogStatus = {
  progress: number;
  text: string;
  currentFiles: string[];
};

export function createLogObserver(logId: string) {
  const state = $state<{ status: LogStatus; events: LogEvent[] }>({
    status: {
      progress: 0,
      text: '',
      currentFiles: [],
    },
    events: [],
  });

  const buffer: LogEvent[] = [];

  const flush = debounce(
    () => {
      state.status = { ...state.status };
      state.events = buffer.slice();
    },
    50,
    { maxWait: 100 },
  );

  const onEvent = (event: LogEvent) => {
    buffer.unshift(event);
    buffer.splice(50);

    switch (event.message_type) {
      case 'status':
        state.status = {
          progress: event.percent_done,
          text: event.seconds_remaining
            ? `${event.seconds_remaining} seconds remaining`
            : '',
          currentFiles: event.current_files ?? [],
        };
        flush();
        break;
      case 'summary':
        state.status = {
          progress: 1,
          text: '',
          currentFiles: [],
        };
        flush();
        flush.flush();
        break;
    }
  };

  const source = new EventSource(new URL(`/api/logs/${logId}`, defaults.baseUrl));
  source.addEventListener('message', ({ data }) => onEvent(JSON.parse(data)));

  return {
    get status() { return state.status; },
    get events() { return state.events; },
    destroy() {
      flush.cancel();
      source.close();
    },
  };
}
