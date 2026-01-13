export default function teardown() {
  return new Promise((resolve) => {
    /**
     * @type {import('node:child_process').ChildProcessWithoutNullStreams}
     */
    const process = globalThis.__RESTIC_API__;

    if (process.exitCode !== null) {
      resolve();
    } else {
      process.stderr.destroy();
      process.stdout.destroy();
      process.on('exit', resolve);
      process.kill('SIGKILL');
    }
  });
}
