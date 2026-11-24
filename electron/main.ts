import path from 'node:path';
import { BrowserWindow, app, screen } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db/connection';
import { SyncManager } from './sync/manager';
import { SyncStore } from './sync/store';
import { registerIpc } from './ipc';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Test hook: `npm run smoke` points this at a throwaway directory so the real
// user profile and database are never touched.
const USER_DATA_OVERRIDE = process.env.TASK_SESSIONS_USER_DATA;
if (USER_DATA_OVERRIDE) {
  app.setPath('userData', path.resolve(USER_DATA_OVERRIDE));
}

let db: DatabaseSync | null = null;
let syncManager: SyncManager | null = null;

function broadcastSyncStatus(_channel: string, status: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('sync:status', status);
  }
}

function createWindow(): BrowserWindow {
  // Keep the window inside the usable screen. On small or high-DPI displays
  // the fixed 760px default would extend behind the taskbar and clip the
  // sidebar footer (sync panel) at the bottom.
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1100, workWidth);
  const height = Math.min(760, workHeight);

  const window = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(800, width),
    minHeight: Math.min(600, height),
    center: true,
    title: 'Task Sessions',
    backgroundColor: '#f4f5f7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.tasksessions.desktop');

    const databasePath = path.join(app.getPath('userData'), 'task-sessions.db');
    const database = openDatabase(databasePath);
    db = database;
    syncManager = new SyncManager(database, {
      storage: new SyncStore(app.getPath('userData')),
      hooks: { broadcast: (channel, payload) => broadcastSyncStatus(channel, payload) },
    });
    registerIpc(db, syncManager);

    void syncManager.start();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    syncManager?.stop();
    syncManager = null;
    db?.close();
    db = null;
  });
}
