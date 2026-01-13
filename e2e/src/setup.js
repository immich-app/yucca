import { spawn } from 'node:child_process';

export default function setup() {
  return new Promise((resolve) => {
    const process = spawn('mise', ['restic-api:dev']);

    let stdout = '';
    function onStdout(buffer) {
      stdout += buffer;

      if (stdout.includes('Nest application successfully started')) {
        process.stdout.off('data', onStdout);
        resolve();
      }
    }

    process.stdout.on('data', onStdout);
    globalThis.__RESTIC_API__ = process;
  });
}
