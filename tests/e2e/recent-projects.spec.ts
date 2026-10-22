import { expect, test, type Page } from '../../frontend/node_modules/@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(__dirname, '../..');
const base = 'http://127.0.0.1:8000/api';
async function project(page: Page, name: string, code: string) {
 const job = await (await page.request.post(base + '/repositories/import', { data: { name, files: { 'main.py': code } } })).json();
 let id = ''; await expect.poll(async () => { const j = await (await page.request.get(base + '/jobs/' + job.id)).json(); id = j.repository_id; return j.status; }).toBe('completed');
 const summary = await (await page.request.get(base + '/repositories/' + id)).json();
 const symbols = await (await page.request.get(base + '/repositories/' + id + '/symbols')).json();
 const selected = symbols.items.find((s: { kind: string }) => s.kind === 'Function').id;
 return { id, url: '/#codemotion=' + encodeURIComponent(JSON.stringify({ format: 1, repository: id, snapshot: summary.repository.snapshot, state: { view: { mode: 'objects', selected, flowId: null, playback: null } } })) };
}
test('recent projects retain independent panels across reload and resume', async ({ page }) => {
 const a = await project(page, 'Projet Alpha', 'def alpha():\n return 1');
 const b = await project(page, 'Projet Beta', 'def beta():\n return 2');
 await page.goto(a.url); await page.getByRole('button', { name: 'Détails', exact: true }).click();
 await expect(page.locator('.save-status')).toContainText('Enregistré');
 await page.goto(b.url); await expect(page.locator('.repo-title')).toContainText('Projet Beta');
 if (await page.getByRole('button', { name: 'Détails', exact: true }).getAttribute('aria-pressed') === 'false') await page.getByRole('button', { name: 'Détails', exact: true }).click();
 await expect(page.locator('.save-status')).toContainText('Enregistré');
 await page.getByRole('button', { name: 'Accueil des projets' }).click();
 const cards = page.locator('.recent-projects article'); await expect(cards).toHaveCount(2);
 await expect(cards.first()).toContainText('Projet Beta');
 await expect(cards.first()).toContainText('Dernière ouverture'); await expect(cards.first()).toContainText('Snapshot');
 await page.reload(); await expect(cards).toHaveCount(2);
 await page.screenshot({ path: path.join(root, 'docs/recent-projects.png') });
 await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(root, 'docs/recent-projects-mobile.png') });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.setViewportSize({ width: 1500, height: 1000 });
 await cards.filter({ hasText: 'Projet Alpha' }).getByRole('button', { name: 'Reprendre', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Détails', exact: true })).toHaveAttribute('aria-pressed', 'false');
 await page.getByRole('button', { name: 'Accueil des projets' }).click();
 await cards.filter({ hasText: 'Projet Beta' }).getByRole('button', { name: 'Reprendre', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Détails', exact: true })).toHaveAttribute('aria-pressed', 'true');
 // A missing older snapshot must not block exporting the active project.
 await page.request.delete(base + '/snapshots/' + a.id);
 const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exporter mon travail' }).click();
 const downloaded = await (await downloadEvent).path(); const backup = JSON.parse(await fs.readFile(downloaded!, 'utf8'));
 expect(backup.sessions).toHaveLength(1); expect(backup.sessions[0].repository).toBe(b.id);
});
test('quota failure preserves the last save and allows exporting unsaved state then retrying', async ({ page }) => {
 const a = await project(page, 'Projet Quota', 'def quota():\n return 3');
 await page.goto(a.url); await expect(page.locator('.save-status')).toContainText('Enregistré');
 const previous = await page.evaluate(() => localStorage.getItem('codemotion.workspaces.v2'));
 await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } });
  Storage.prototype.setItem = function(key, value) { if (key === 'codemotion.workspaces.v2') throw new DOMException('full', 'QuotaExceededError'); original.call(this, key, value); };
 });
 await page.getByRole('button', { name: 'Détails', exact: true }).click();
 await expect(page.locator('.save-status')).toContainText('Échec de sauvegarde');
 await expect(page.locator('.save-status')).toContainText('Stockage navigateur plein');
 expect(await page.evaluate(() => localStorage.getItem('codemotion.workspaces.v2'))).toBe(previous);
 const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exporter mon travail' }).click();
 const downloaded = await (await downloadEvent).path(); const backup = JSON.parse(await fs.readFile(downloaded!, 'utf8'));
 expect(backup.sessions.find((s: { repository: string }) => s.repository === a.id).state.panels.inspector).toBe(false);
 expect(backup.snapshots).toHaveLength(1);
 await page.screenshot({ path: path.join(root, 'docs/save-status-error.png') });
 await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
 await page.getByRole('button', { name: 'Réessayer la sauvegarde' }).click(); await expect(page.locator('.save-status')).toContainText('Enregistré');
 await expect(page.locator('.save-status')).toContainText('Dernière sauvegarde');
});
