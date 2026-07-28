import { toastManager } from '@immich/ui';

// Surfaces a server error as a toast, preferring the API's message. Mirrors the
// orchestrator-ui helper but self-contained for the web app.
export const handleError = (error: unknown, fallback: string) => {
  console.error(error);

  let message = fallback;
  const data = (error as { data?: unknown } | undefined)?.data;
  const raw = typeof data === 'string' ? tryParse(data) : data;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) {
      message = m.length > 120 ? m.slice(0, 117) + '...' : m;
    }
  }

  toastManager.danger(message);
};

const tryParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
