import { WriteStream } from 'node:fs';
import { TaskStatus } from '../enum';
import { getTaskStatus, TaskWarningsError, writeError } from './errors';

const collectWrites = (error: unknown) => {
  const lines: string[] = [];
  writeError({ write: (line: string) => lines.push(line) } as unknown as WriteStream, error);
  return lines.map((line) => JSON.parse(line));
};

describe('TaskWarningsError', () => {
  it('maps to the warn status', () => {
    expect(getTaskStatus(new TaskWarningsError([new Error('a')]))).toBe(TaskStatus.Warn);
  });

  it('writes one log event per collected error', () => {
    expect(collectWrites(new TaskWarningsError([new Error('first'), new Error('second')]))).toEqual([
      { message_type: 'error', error: 'Error: first' },
      { message_type: 'error', error: 'Error: second' },
    ]);
  });
});
