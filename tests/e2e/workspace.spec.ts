import { expect, test } from '../../frontend/node_modules/@playwright/test';
import path from 'node:path';
const root = path.resolve(__dirname, '../..');
test('real folder import, class inspection, source, flow, offline playback and return', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Import Python folder').setInputFiles(path.join(root, 'examples/object-oriented'));
  await expect(page.locator('.repo-title')).toContainText('object-oriented');
  await page.locator('.tree-symbol').filter({ hasText: 'Car' }).click();
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
  await expect(page.locator('.step-count')).toHaveText('2 / 2 visited');
  await page.getByRole('button', { name: 'Previous step', exact: true }).click();
  await expect(page.locator('.step-count')).toHaveText('1 / 2 visited');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.step-count')).not.toHaveText('1 / 2 visited');
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
  await page.locator('.tree-symbol').filter({ hasText: /^process$/ }).click();
  await page.getByRole('button', { name: 'Explore Data Flow', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('normalize');
  await page.getByRole('button', { name: 'Enter flow' }).click();
  await expect(page.locator('.breadcrumb')).toContainText('normalize');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.breadcrumb')).toContainText('process');
});





