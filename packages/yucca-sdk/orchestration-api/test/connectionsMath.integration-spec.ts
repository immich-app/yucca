import { evaluateConnectionsMath, isValidConnectionsMath } from '../src/utils/connectionsMath';

describe('evaluateConnectionsMath', () => {
  it.each([
    ['16', 4, 16],
    ['cores', 4, 4],
    ['cores * 2', 4, 8],
    ['min(16, cores * 2)', 4, 8],
    ['min(16, cores * 2)', 32, 16],
    ['max(2, cores / 2)', 1, 2],
    ['(cores + 2) * 2 - 1', 3, 9],
    ['min(max(1, cores), 8)', 64, 8],
  ])('evaluates %s with cores=%d to %d', (expression, cores, expected) => {
    expect(evaluateConnectionsMath(expression, cores)).toBe(expected);
  });

  it.each(['', 'foo', 'min(1)', 'min(1, 2', '1 +', '2 ** 3', 'cores cores', '1; process.exit(1)'])(
    'rejects %s',
    (expression) => {
      expect(() => evaluateConnectionsMath(expression, 4)).toThrow();
      expect(isValidConnectionsMath(expression)).toBe(false);
    },
  );
});
