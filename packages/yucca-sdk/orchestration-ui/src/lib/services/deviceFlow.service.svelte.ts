import type { DeviceFlowEventDto } from '$lib/fetch-client';
import {
  startDeviceFlow,
  type DeviceFlowKind,
} from '$lib/services/session.service';

const failures: Record<string, string> = {
  NOT_CONNECTED:
    'This instance is not connected to a FUTO Backups account yet.',
  DEVICE_FLOW_FAILED: 'Login was cancelled or timed out.',
  WRONG_ACCOUNT:
    'That account does not own this instance. Log in with the account it was connected with.',
  UNKNOWN: 'Could not reach FUTO Backups. Check your connection.',
};

export function createDeviceFlow(
  kind: DeviceFlowKind,
  handlers: {
    createSession: (token: string) => Promise<unknown>;
    onComplete: (event: DeviceFlowEventDto) => void;
    onFailure?: (message: string) => void;
  },
) {
  const state = $state<{
    userCode: string | undefined;
    verificationUri: string | undefined;
    error: string | undefined;
    pending: boolean;
  }>({
    userCode: undefined,
    verificationUri: undefined,
    error: undefined,
    pending: false,
  });

  let close: (() => void) | undefined;

  const stop = () => {
    close?.();
    close = undefined;
  };

  const complete = async (event: DeviceFlowEventDto) => {
    if (event.token) {
      await handlers.createSession(event.token);
    }

    state.pending = false;
    handlers.onComplete(event);
  };

  const start = () => {
    stop();

    state.userCode = undefined;
    state.error = undefined;
    state.pending = true;

    close = startDeviceFlow(kind, (event) => {
      switch (event.type) {
        case 'START': {
          state.userCode = event.userCode;
          state.verificationUri = event.verificationUri;
          window.open(event.verificationUri, '_blank');
          break;
        }
        case 'SUCCESS': {
          stop();

          void complete(event);
          break;
        }
        case 'FAILURE': {
          stop();
          state.pending = false;
          state.userCode = undefined;
          state.error = failures[event.reason ?? 'UNKNOWN'];
          handlers.onFailure?.(state.error);
          break;
        }
      }
    });
  };

  return {
    state,
    start,
    stop,
  };
}
