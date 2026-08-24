import { billableBytes } from '@common/server';

const MIB = 1 << 20;

describe('billableBytes (storage-tier billing floor)', () => {
  it('bills immich at raw size (no per-object floor)', () => {
    expect(billableBytes('immich', 10 * MIB, 1000)).toBe(10 * MIB);
    expect(billableBytes('immich', 1024, 500)).toBe(1024);
  });

  it('floors standalone like restic', () => {
    expect(billableBytes('standalone', 1024, 500)).toBe(500 * MIB);
    expect(billableBytes('standalone', 800 * MIB, 500)).toBe(800 * MIB);
  });

  it('floors small restic objects at 1 MiB each', () => {
    expect(billableBytes('restic', 1024, 100)).toBe(100 * MIB);
  });

  it('passes restic through when actual size already exceeds the floor', () => {
    expect(billableBytes('restic', 500 * MIB, 100)).toBe(500 * MIB);
  });

  it('takes the larger of size and floor at the boundary', () => {
    expect(billableBytes('restic', 100 * MIB, 100)).toBe(100 * MIB);
    expect(billableBytes('restic', 100 * MIB + 1, 100)).toBe(100 * MIB + 1);
  });

  it('treats an empty repository as zero', () => {
    expect(billableBytes('restic', 0, 0)).toBe(0);
    expect(billableBytes('immich', 0, 0)).toBe(0);
  });

  it('treats an unknown type as un-floored (raw size)', () => {
    expect(billableBytes('mystery', 1024, 100)).toBe(1024);
  });
});
