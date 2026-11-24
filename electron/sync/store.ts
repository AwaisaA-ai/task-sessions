import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { SyncConfigInput } from '../../shared/types';

export interface StoredSyncSession {
  email: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Persists the Supabase project config and the encrypted auth session.
 *
 * Tokens go through Electron's `safeStorage` (OS keychain on macOS/Windows,
 * libsecret on Linux) and fall back to a clearly-marked plaintext blob when the
 * platform backend is unavailable, so sync degrades gracefully instead of
 * crashing on exotic Linux setups.
 */
export class SyncStore {
  private readonly configFile: string;
  private readonly sessionFile: string;
  private readonly plaintextSessionPath: string;

  constructor(userDataDir: string) {
    this.configFile = path.join(userDataDir, 'sync-config.json');
    this.sessionFile = path.join(userDataDir, 'sync-session.json');
    this.plaintextSessionPath = path.join(userDataDir, 'sync-session.txt');
  }

  async loadConfig(): Promise<SyncConfigInput | null> {
    try {
      const raw = await fs.promises.readFile(this.configFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SyncConfigInput>;
      if (!parsed.url || !parsed.anonKey) return null;
      return { url: parsed.url, anonKey: parsed.anonKey };
    } catch {
      return null;
    }
  }

  async saveConfig(input: SyncConfigInput): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.configFile), { recursive: true });
    await fs.promises.writeFile(this.configFile, JSON.stringify(input, null, 2), 'utf8');
  }

  async loadSession(): Promise<StoredSyncSession | null> {
    try {
      const raw = await fs.promises.readFile(this.sessionFile, 'utf8');
      const parsed = JSON.parse(raw) as StoredSyncSession;
      if (!parsed?.email || !parsed?.accessToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async saveSession(session: StoredSyncSession): Promise<void> {
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(JSON.stringify(session))
      : Buffer.from(JSON.stringify(session), 'utf8');

    if (safeStorage.isEncryptionAvailable()) {
      await fs.promises.writeFile(this.sessionFile, encrypted.toString('base64'), 'utf8');
    } else {
      await fs.promises.mkdir(path.dirname(this.plaintextSessionPath), { recursive: true });
      await fs.promises.writeFile(this.plaintextSessionPath, JSON.stringify(session), 'utf8');
    }

    if (!safeStorage.isEncryptionAvailable()) {
      await fs.promises.writeFile(this.plaintextSessionPath, JSON.stringify(session), 'utf8');
    }
  }

  async clearSession(): Promise<void> {
    await fs.promises.rm(this.sessionFile, { force: true }).catch(() => undefined);
    await fs.promises.rm(this.plaintextSessionPath, { force: true }).catch(() => undefined);
  }
}
