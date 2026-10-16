import { expect, test } from '../../frontend/node_modules/@playwright/test';
import path from 'node:path';
const root = path.resolve(__dirname, '../..');
test('real folder import, class inspection, source, flow, offline playback and return', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Import Python folder').setInputFiles(path.join(root, 'examples/object-oriented'));
  await expect(page.locator('.repo-title')).toContainText('object-oriented');
  await page.getByLabel('Search symbols').fill('Car');
  await page.locator('.file-tree .search-result').filter({ hasText: 'Car' }).click();
  await expect(page.locator('.inspector h2')).toHaveText('Car');
  await expect(page.locator('.inspector')).toContainText('engine');
  await expect(page.locator('.inspector')).toContainText('wheels');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.graph-card.active')).toBeVisible();
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();
  await page.screenshot({ path: path.join(root, 'docs/object-inspector.png') });
  await page.locator('.method-row').filter({ hasText: 'drive' }).click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  await expect(page.locator('.static-label')).toHaveText('STATIC FLOW');
  await expect(page.locator('.graph-card.active')).toBeVisible();
  await page.route('**/api/**', route => route.abort());
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.step-count')).toContainText('2 / 2 étapes');
  await page.getByRole('button', { name: 'Previous step', exact: true }).click();
  await expect(page.locator('.step-count')).toContainText('1 / 2 étapes');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.step-count')).not.toContainText('1 / 2 étapes');
  await page.getByRole('button', { name: 'Reset playback', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.graph-card.active')).toBeInViewport();
  await page.screenshot({ path: path.join(root, 'docs/data-flow-player.png') });
  await page.getByRole('button', { name: 'Inspect Object / Function' }).click();
  await expect(page.locator('.inspector h2')).toHaveText('drive');
  expect(errors).toEqual([]);
});

test('real branching and loops require explicit hypothetical paths', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import repository', exact: true }).click();
  await page.getByRole('button', { name: 'branching', exact: true }).click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'True', exact: true }).click();
  await expect(page.locator('.operation-title')).toContainText("return 'accept'");
  await page.getByRole('button', { name: 'Previous step', exact: true }).click();
  await page.getByRole('button', { name: 'False', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end' }).click();
  await page.getByRole('button', { name: 'Import repository', exact: true }).click();
  await page.getByRole('button', { name: 'loops', exact: true }).click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Body (symbolic)', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end' }).click();
  await expect(page.getByRole('button', { name: 'Body (symbolic)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page.locator('.operation-title')).toContainText('return total');
});

test('multi-module graph, filtering and resolved callee navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the example', exact: true }).click();
  await expect(page.locator('.repo-title')).toContainText('multi-module');
  await page.getByLabel('Search symbols').fill('CreditService.process');
  await page.locator('.file-tree .search-result').click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('normalize');
  await page.getByRole('button', { name: 'Enter flow' }).click();
  await expect(page.locator('.breadcrumb')).toContainText('normalize');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.breadcrumb')).toContainText('process');
});







test('inspection preserves playback, saves/restores a session and exports its path', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the example', exact: true }).click();
  await page.getByLabel('Search symbols').fill('CreditService.process');
  await page.locator('.file-tree .search-result').click();
  await page.getByRole('button', { name: 'Data Flow Player', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  const step = await page.locator('.step-count').innerText();
  await page.locator('.graph-card').filter({ hasText: 'normalize' }).first().click();
  await expect(page.locator('.step-count')).toHaveText(step);
  await expect(page.getByText('Inspection libre', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Revenir à l’étape active', exact: true }).click();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByLabel('Nom du parcours').fill('Test de restauration');
  await page.getByRole('button', { name: 'Enregistrer la session' }).click();
  await expect(page.getByRole('button', { name: 'Restaurer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer / Close' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.locator('.step-count')).toHaveText(step);
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'MARKDOWN', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toContain('parcours.md');
  await download.saveAs(path.join(root, 'docs/validation-parcours.md'));
});

test('global keyboard search, source references and narrow layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the example', exact: true }).click();
  await page.getByLabel('Search symbols').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Recherche globale', exact: true }).fill('normalize');
  await expect(page.getByRole('listbox', { name: 'Résultats' }).getByRole('option').first()).toContainText('normalize');
  await page.getByRole('combobox', { name: 'Recherche globale', exact: true }).press('Enter');
  await expect(page.locator('.inspector h2')).toHaveText('normalize');
  await page.getByRole('button', { name: 'Références', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('shop/service.py');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Arbre', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer l’arbre' }).click();
  await page.getByRole('button', { name: 'Détails', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer les détails' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await page.screenshot({ path: path.join(root, 'docs/v2-mobile-light.png') });
});


test('late symbol responses cannot replace the newer selection and direct links restore', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import Python folder').setInputFiles(path.join(root, 'examples/object-oriented'));
  await page.getByLabel('Search symbols').waitFor();
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/symbols/*', async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.symbol?.name === 'drive') { release(); await new Promise(resolve => setTimeout(resolve, 400)); }
    await route.fulfill({ response });
  });
  await page.getByLabel('Search symbols').fill('Car.drive');
  await page.locator('.file-tree .search-result').click();
  await waiting;
  await page.getByLabel('Search symbols').fill('Engine.start');
  await page.locator('.file-tree .search-result').click();
  await expect(page.locator('.inspector h2')).toHaveText('start');
  await page.getByRole('button', { name: 'Data Flow Player', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  const step = await page.locator('.step-count').innerText();
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  const link = await page.getByLabel('Lien direct local').inputValue();
  await page.goto(link);
  await expect(page.locator('.step-count')).toHaveText(step);
  await expect(page.locator('.breadcrumb')).toContainText('start');
});

test('missing snapshot links show an actionable message', async ({ page }) => {
  const saved = { format: 1, repository: '000000000000000000000000', snapshot: 'gone', state: { view: { mode: 'objects', selected: null, flowId: null, playback: null } } };
  await page.goto('/#codemotion=' + encodeURIComponent(JSON.stringify(saved)));
  await expect(page.getByRole('alert').first()).toContainText('Snapshot absent');
  await expect(page.getByRole('button', { name: 'Import repository', exact: true })).toBeVisible();
});

test('real project snapshot, variable path and every export format', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const repository = '8e409ee6ccd42af6faf8dbd6';
  const snapshot = await page.request.get(`http://127.0.0.1:8000/api/repositories/${repository}`);
  test.skip(!snapshot.ok(), 'Run scripts/validate_real_project.py to create the optional real snapshot');
  const saved = { format: 1, repository, snapshot: (await snapshot.json()).repository.snapshot, state: { view: { mode: 'objects', selected: 'a9a01d55e14fca38908a2e9a', flowId: null, playback: null } } };
  await page.goto('/#codemotion=' + encodeURIComponent(JSON.stringify(saved)));
  await expect(page.locator('.inspector h2')).toHaveText('step');
  await page.getByRole('button', { name: 'Data Flow Player', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end', exact: true }).click();
  await expect(page.locator('.operation-title')).toContainText('self._done');
  await page.getByRole('button', { name: 'False', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end', exact: true }).click();
  await page.getByRole('button', { name: 'False', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.operation-title')).toContainText('decision_pd');
  await page.screenshot({ path: path.join(root, 'docs/v2-real-flow-dark.png') });
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  for (const format of ['JSON', 'SVG', 'PNG', 'MERMAID', 'MARKDOWN']) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    await download.saveAs(path.join(root, 'docs/exports', download.suggestedFilename()));
    const fs = await import('node:fs/promises');
    const bytes = await fs.readFile((await download.path())!);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'JSON') expect(JSON.parse(bytes.toString()).metadata.repository.id).toBe(repository);
    if (format === 'SVG') expect(bytes.toString()).toContain('<svg');
    if (format === 'PNG') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    if (format === 'MERMAID') expect(bytes.toString()).toContain('flowchart');
    if (format === 'MARKDOWN') expect(bytes.toString()).toContain('decision_pd');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await page.screenshot({ path: path.join(root, 'docs/v2-real-flow-light.png') });
});

test('player preserves a recorded path and revisits decisions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import repository', exact: true }).click();
  await page.getByRole('button', { name: 'branching', exact: true }).click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Advance to next decision or end' }).click();
  await page.getByRole('button', { name: 'True', exact: true }).click();
  const count = await page.getByLabel('Aller à une étape du parcours').locator('option').count();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByLabel('Aller à une étape du parcours').locator('option')).toHaveCount(count);
  await page.getByLabel('Aller à une étape du parcours').selectOption(String(count - 1));
  await expect(page.locator('.operation-title')).toContainText("return 'accept'");
  await page.getByRole('button', { name: 'Décision précédente', exact: true }).click();
  await expect(page.getByText('Changer de branche', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'docs/player-workflow-desktop.png') });
  await page.getByRole('button', { name: 'False', exact: true }).click();
  await expect(page.locator('.operation-title')).not.toContainText("return 'accept'");
  await expect(page.getByLabel('Aller à une étape du parcours').locator('option')).toHaveCount(count);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Aller à une étape du parcours')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeInViewport();
  await expect(page.locator('.graph-card.active')).toBeInViewport();
  await page.screenshot({ path: path.join(root, 'docs/player-workflow-mobile.png') });
});
