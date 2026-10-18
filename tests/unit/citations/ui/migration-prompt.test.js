/**
 * @jest-environment jsdom
 *
 * Tests for the first-run migration prompt content (pure builder — no overlay).
 */

import { createMigrationPromptContent } from '../../../../src/features/citations/ui/migration-prompt.js';

function makeMigration(over = {}) {
  return {
    startFresh: jest.fn(async () => ({ mode: 'fresh', imported: 0, skipped: 0 })),
    bestEffortImport: jest.fn(async () => ({ mode: 'import', imported: 2, skipped: 1 })),
    ...over,
  };
}

describe('createMigrationPromptContent', () => {
  it('renders both choices and the honest other-sites note', () => {
    const { root, freshBtn, importBtn } = createMigrationPromptContent({
      migration: makeMigration(),
      onResolved: () => {},
    });
    expect(freshBtn.textContent).toBe('Start fresh');
    expect(importBtn.textContent).toBe('Import what we can');
    expect(root.querySelector('.assist-cite-migration__note').textContent).toMatch(
      /can't be moved|aren't deleted/i
    );
  });

  it('Start fresh runs startFresh and resolves immediately (nothing to report)', async () => {
    const migration = makeMigration();
    const onResolved = jest.fn();
    const { freshBtn } = createMigrationPromptContent({ migration, onResolved });

    freshBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(migration.startFresh).toHaveBeenCalledTimes(1);
    expect(migration.bestEffortImport).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledWith({ mode: 'fresh', imported: 0, skipped: 0 });
  });

  it('Import runs bestEffortImport, announces the count, then offers Continue', async () => {
    const migration = makeMigration();
    const onResolved = jest.fn();
    const { root, importBtn, status } = createMigrationPromptContent({ migration, onResolved });

    importBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(migration.bestEffortImport).toHaveBeenCalledTimes(1);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/Recovered 2 citations to review; 1 couldn't be recovered/);
    // Import does NOT auto-close — a Continue button appears.
    expect(onResolved).not.toHaveBeenCalled();
    const cont = root.querySelector('.assist-cite-migration__actions button');
    expect(cont.textContent).toBe('Continue to library');

    cont.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    expect(onResolved).toHaveBeenCalledWith({ mode: 'import', imported: 2, skipped: 1 });
  });

  it('announces a friendly message when import recovers nothing', async () => {
    const migration = makeMigration({
      bestEffortImport: jest.fn(async () => ({ mode: 'import', imported: 0, skipped: 0 })),
    });
    const { importBtn, status } = createMigrationPromptContent({ migration, onResolved: () => {} });

    importBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(status.textContent).toMatch(/couldn't recover any citations/i);
    expect(status.className).toMatch(/amber/);
  });

  it('re-enables the buttons and shows the error if migration throws', async () => {
    const migration = makeMigration({
      bestEffortImport: jest.fn(async () => {
        throw new Error('offscreen down');
      }),
    });
    const onResolved = jest.fn();
    const { freshBtn, importBtn, status } = createMigrationPromptContent({ migration, onResolved });

    importBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(status.textContent).toMatch(/offscreen down/);
    expect(freshBtn.disabled).toBe(false);
    expect(importBtn.disabled).toBe(false);
    expect(onResolved).not.toHaveBeenCalled();
  });
});
