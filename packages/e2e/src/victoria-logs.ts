const baseUrl = `http://localhost:9428`;

export const queryVictoriaLogs = async (logsql: string, limit = 2000): Promise<Record<string, unknown>[]> => {
  const url = new URL('/select/logsql/query', baseUrl);
  url.searchParams.set('query', logsql);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`VictoriaLogs query failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.text();
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

export const waitForLog = async (
  predicate: (record: Record<string, unknown>) => boolean,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = await queryVictoriaLogs('_time:5m');
    const match = records.find((record) => predicate(record));
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out waiting for log record in VictoriaLogs');
};
