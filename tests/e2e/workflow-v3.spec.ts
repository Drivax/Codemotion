import { expect, test, type Page } from '../../frontend/node_modules/@playwright/test';
import path from 'node:path';
const base = 'http://127.0.0.1:8000/api';
const root = path.resolve(__dirname, '../..');
async function importProject(page: Page, code: string, name: string) {
  const job = await (await page.request.post(`${base}/repositories/import`, { data: { name, files: { 'workflow_v3.py': code } } })).json();
  let repository = '';
  await expect.poll(async () => { const result = await (await page.request.get(`${base}/jobs/${job.id}`)).json(); repository = result.repository_id; return result.status; }).toBe('completed');
  const summary = await (await page.request.get(`${base}/repositories/${repository}`)).json();
  const symbols = await (await page.request.get(`${base}/repositories/${repository}/symbols`)).json();
  const entry = symbols.items.find((n: { name: string }) => n.name === 'entry');
  const flow = await (await page.request.get(`${base}/repositories/${repository}/flows/${entry.id}`)).json();
  return { repository, summary, entry, flow };
}
async function openFlow(page: Page, project: Awaited<ReturnType<typeof importProject>>) {
  const state = { format: 1, repository: project.repository, snapshot: project.summary.repository.snapshot, state: { view: { mode: 'flow', selected: project.entry.id, flowId: project.entry.id, playback: { trail: [project.flow.entry], index: 0 } } } };
  await page.goto('/#codemotion=' + encodeURIComponent(JSON.stringify(state)));
  await expect(page.locator('.step-count')).toContainText('1 / 1 étapes');
}
const code = 'def helper(x):\n return x + 1\ndef entry(x):\n changed = helper(x)\n return changed\n';
test('breakpoint pauses before a call, resumes, persists and roundtrips a complete backup', async ({ page }) => {
  const project = await importProject(page, code, 'workflow-v3-backup-test');
  await openFlow(page, project);
  await expect(page.locator('.service-status')).toContainText('API disponible');
  await page.locator('.breakpoints summary').click();
  await page.getByLabel('Avant les appels', { exact: true }).check();
  await page.getByRole('button', { name: 'Lire', exact: true }).click();
  await expect(page.locator('.player-wrap')).toContainText('Point d’arrêt avant : changed = helper(x)');
  await expect(page.locator('.step-count')).toContainText('1 / 1 étapes');
  await page.screenshot({ path: path.join(root, 'docs/workflow-v3-breakpoint.png') });
  await page.getByRole('button', { name: 'Étape suivante', exact: true }).click();
  await expect(page.locator('.step-count')).toContainText('2 / 2 étapes');
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByLabel('Nom du parcours', { exact: true }).fill('Sauvegarde complète V3');
  await page.getByRole('button', { name: 'Enregistrer la session', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter la sauvegarde', exact: true }).click();
  const download = await downloadEvent;
  const file = await download.path();
  expect(file).toBeTruthy();
  await page.evaluate(() => localStorage.clear());
  expect((await page.request.delete(`${base}/snapshots/${project.repository}`)).ok()).toBeTruthy();
  await page.getByLabel('Importer une sauvegarde', { exact: true }).setInputFiles(file!);
  await expect(page.getByRole('dialog')).toContainText('1 session(s) lue(s)');
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.locator('.step-count')).toContainText('2 / 2 étapes');
  await page.locator('.breakpoints summary').click();
  await expect(page.getByLabel('Avant les appels', { exact: true })).toBeChecked();
});
test('version comparison identifies changed function, callers and incompatible saved session', async ({ page }) => {
  const before = await importProject(page, code + '\ndef dependent(): return entry(2)\n', 'workflow-v3-before');
  const after = await importProject(page, code.replace('changed = helper(x)', 'changed = helper(x * 2)') + '\ndef dependent(): return entry(2)\n', 'workflow-v3-after');
  await openFlow(page, before);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByLabel('Nom du parcours', { exact: true }).fill('Parcours ancienne version');
  await page.getByRole('button', { name: 'Enregistrer la session', exact: true }).click();
  await page.getByRole('dialog').locator('article').filter({ hasText: 'workflow-v3-after' }).getByRole('button', { name: 'Comparer au snapshot actif' }).click();
  await expect(page.getByRole('dialog')).toContainText('Session : Parcours ancienne version · À reconstruire');
  await expect(page.getByRole('dialog')).toContainText('Flux modifié ou indisponible');
  await page.getByText('Appelants impactés dans la version de base, y compris les suppressions', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('workflow_v3.dependent');
  await page.screenshot({ path: path.join(root, 'docs/workflow-v3-versions.png') });
});
