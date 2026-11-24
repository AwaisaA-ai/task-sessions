/**
 * End-to-end smoke test: drives the real packaged renderer in Electron and
 * walks through PLAN.md section 7 (definition of done for v1).
 *
 *   npm run smoke
 *
 * The only thing it cannot automate is the native save dialog, so the export
 * step checks that the controls exist; the CSV/JSON builders are covered by
 * electron/export.test.ts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright-core';

const ROOT = process.cwd();
const EXECUTABLE = (await import('electron')).default;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-sessions-smoke-'));

const results = [];
const consoleErrors = [];
const pageErrors = [];
const attached = new Set();

function record(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${name}${detail ? `  (${detail})` : ''}`);
}

function attach(page) {
  if (attached.has(page)) return;
  attached.add(page);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
}

async function launch() {
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, TASK_SESSIONS_USER_DATA: userDataDir },
  });

  app.on('window', attach);
  const page = await app.firstWindow();
  attach(page);
  await page.getByRole('heading', { name: 'Task Sessions' }).waitFor({ timeout: 15_000 });

  return { app, page };
}

async function run() {
  console.log(`\nSmoke test profile: ${userDataDir}\n`);

  let { app, page } = await launch();

  // 1. Cold start shows the empty state.
  record('first launch shows the empty state', await page.getByText('No sessions yet').isVisible());
  record(
    'onboarding banner explains offline + optional sync',
    await page.getByText('Your data lives on this device first.').isVisible(),
  );
  record(
    'sidebar shows the offline sync panel',
    await page.getByText('Offline mode', { exact: true }).isVisible(),
  );

  // 2. Create a session.
  await page.getByRole('button', { name: 'New session' }).first().click();
  await page.getByLabel('Session name').fill('Weekly review');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByRole('button', { name: 'Weekly review' }).waitFor();
  record(
    'new session appears in the list and opens at 0%',
    (await page.getByRole('progressbar', { name: 'Session progress' }).getAttribute('value')) ===
      '0',
  );

  // 3. Add three tasks.
  for (const label of ['A', 'B', 'C']) {
    await page.getByLabel('Add a task').fill(label);
    await page.getByLabel('Add a task').press('Enter');
    await page.getByRole('checkbox', { name: label, exact: true }).waitFor();
  }
  record(
    'three tasks read 0 of 3',
    (await page.getByRole('main').getByText('0 of 3 tasks done', { exact: true }).isVisible()) &&
      (await page.getByRole('checkbox').count()) === 6,
  );

  // 4. Toggle one task and time it from click to the bar moving.
  const elapsed = await page.evaluate(async () => {
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
    const box = boxes.find((element) => element.getAttribute('aria-label') === 'A');
    const bar = document.querySelector('progress[aria-label="Session progress"]');
    if (!box || !bar) return -1;

    const start = performance.now();
    box.click();

    while (Number(bar.value) !== 33) {
      if (performance.now() - start > 3000) return -2;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    return performance.now() - start;
  });

  record(
    'progress bar reaches 33% in under 100 ms',
    elapsed >= 0 && elapsed < 100,
    `${elapsed.toFixed(1)} ms`,
  );
  record(
    'label switches to 1 of 3 tasks done',
    await page.getByRole('main').getByText('1 of 3 tasks done', { exact: true }).isVisible(),
  );

  const liveText = await page.locator('[aria-live="polite"]').innerText();
  record(
    'screen reader live region announces the change',
    /1 of 3 tasks done/.test(liveText) && /33/.test(liveText),
    liveText.trim(),
  );

  // 5. Finish everything; status must NOT flip on its own.
  await page.getByRole('checkbox', { name: 'B', exact: true }).click();
  await page.getByRole('main').getByText('2 of 3 tasks done', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'C', exact: true }).click();
  await page.getByRole('main').getByText('All 3 tasks done', { exact: true }).waitFor();
  record('all three done reads 100%', (await page.getByText('100%').first().isVisible()) === true);
  record(
    'session status stays active (no auto-complete)',
    (await page.getByLabel('Status', { exact: true }).inputValue()) === 'active',
  );

  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'docs', 'app.png') });

  // 6. Restart and confirm everything persisted.
  await app.close();
  ({ app, page } = await launch());

  await page.getByRole('button', { name: 'Weekly review' }).click();
  await page.getByRole('main').getByText('All 3 tasks done', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'A', exact: true }).waitFor();
  record(
    'session and task state survive a restart',
    (await page.getByRole('checkbox').count()) === 6 &&
      (await page.getByRole('checkbox', { name: 'A', exact: true }).isChecked()),
  );

  // 6b. Bulk task delete: multiple selection through the checkboxes.
  await page.getByRole('checkbox', { name: 'Select task B', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select task C', exact: true }).click();
  await page.getByRole('button', { name: 'Delete selected' }).click();
  await page.getByText('All 1 tasks done', { exact: true }).waitFor();
  record('bulk delete removes the selected tasks', true);

  // 7. Delete, then recover from the Archived filter.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete session' }).click();
  await page.getByText('No sessions yet').waitFor();
  record('deleted session disappears from All', true);

  await page.getByRole('button', { name: 'Archived' }).click();
  await page.getByRole('button', { name: 'Weekly review' }).waitFor();
  record('deleted session is recoverable in Archived', true);
  record(
    'archived row is labelled Deleted',
    await page.getByText('Deleted', { exact: true }).first().isVisible(),
  );

  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Weekly review' }).waitFor();
  record('restore puts the session back in All', true);

  // 8. Export controls exist (native save dialog is manual).
  record(
    'export controls are available',
    await page.getByRole('button', { name: 'Export CSV' }).isVisible(),
  );

  // 9. The optional sync flow is discoverable but never forced.
  await page.getByRole('button', { name: 'Set up cloud sync' }).click();
  await page.getByText('Supabase project URL').waitFor();
  record('sync dialog opens from the sidebar', true);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Offline mode', { exact: true }).waitFor();
  record('sync dialog closes and the offline panel returns', true);

  // 10. General settings: theme + motion, opened from the session list header.
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Settings' }).waitFor();
  record('settings dialog opens from the session list header', true);

  await page.getByRole('radio', { name: /^Dark/ }).check();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  record('choosing Dark applies the dark theme immediately', true);

  await page.getByRole('checkbox', { name: /^Reduce motion/ }).check();
  await page.waitForFunction(() => document.documentElement.dataset.reducedMotion === 'true');
  record('reduce motion updates the root attribute', true);

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  record('settings dialog closes with Done', true);

  await page.reload();
  await page.getByRole('heading', { name: 'Task Sessions' }).waitFor();
  record(
    'settings persist across a reload',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  );

  record('no renderer console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  record('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  await app.close();
}

try {
  await run();
} catch (error) {
  record(
    'smoke run completed without crashing',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} failed` : ''}`,
  );

  if (failed.length === 0) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    process.exit(0);
  }

  console.error(`\nProfile kept for debugging: ${userDataDir}`);
  process.exit(1);
}
