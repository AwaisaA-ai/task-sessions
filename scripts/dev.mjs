import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const PORT = 5173;
const DEV_URL = `http://127.0.0.1:${PORT}`;
const children = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen()) return true;
    await sleep(200);
  }
  return false;
}

function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 1. Bundle the Electron main process and preload script once.
await new Promise((resolve, reject) => {
  const build = run(process.execPath, [path.join('scripts', 'build-main.mjs')]);
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('main build failed'))));
}).catch((error) => {
  console.error(error.message);
  shutdown(1);
});

// 2. Start the Vite dev server for the renderer.
const vite = run(process.execPath, [
  path.join('node_modules', 'vite', 'bin', 'vite.js'),
  '--port',
  String(PORT),
  '--strictPort',
]);
vite.on('exit', (code) => {
  if (code) shutdown(code);
});

if (!(await waitForServer())) {
  console.error(`Vite did not come up on ${DEV_URL}.`);
  shutdown(1);
}

// 3. Launch Electron pointed at the dev server.
const electronPath = (await import('electron')).default;
const electron = run(electronPath, ['.'], {
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
});
electron.on('exit', (code) => shutdown(code ?? 0));
