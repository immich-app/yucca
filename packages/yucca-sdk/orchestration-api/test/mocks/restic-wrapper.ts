export const init = jest.fn();
export const backup = jest.fn();
export const restore = jest.fn();
export const snapshots = jest.fn();
export const stats = jest.fn();
export const forget = jest.fn();
export const ls = jest.fn();
export const keyList = jest.fn();
export const version = Promise.resolve({ version: '0.0.0' });

export class ResticBackupCommandCouldNotReadSourceDataError extends Error {}
