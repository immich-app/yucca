import { toastManager } from '@immich/ui';

export function getServerErrorMessage(error: {
  data?: { message?: string };
  message?: string;
}) {
  // errors for endpoints without return types aren't parsed as json
  let data = error.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // Not a JSON string
    }
  }

  return data?.message || error.message;
}

export function standardizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function getReadableErrorMessage(error: unknown): string {
  return (
    getServerErrorMessage(error as never) ||
    standardizeError(error).message ||
    'An unknown error occurred'
  );
}

export function handleError(error: unknown, localizedMessage: string) {
  const standardizedError = standardizeError(error);
  if (standardizedError.name === 'AbortError') {
    return;
  }

  console.error(
    `[handleError]: ${standardizedError}`,
    error,
    standardizedError.stack,
  );

  try {
    let serverMessage = getServerErrorMessage(error as never);
    if (serverMessage) {
      serverMessage = `${String(serverMessage).slice(0, 75)}\n(Yucca Server Error)`;
    }

    const errorMessage = serverMessage || localizedMessage;

    toastManager.danger(errorMessage);

    return errorMessage;
  } catch (error) {
    console.error(error);
    return localizedMessage;
  }
}
