import { beforeEach, expect, it } from 'vitest';
import { guideKey, readGuides, stepFor, validGuides, type DocReference } from './documentation';
import { parseBackup } from './backup';
const snapshot = 'a'.repeat(64);
const ref: DocReference = { label: 'code', text: '[code](main.py#L9)', evidence: 'Lien explicite', status: 'file', path: 'main.py', line: 9, anchor: '', targets: [] };
beforeEach(() => localStorage.clear());
it('preserves explicit line links in generated guide steps', () => {
  expect(stepFor(ref, 'README.md', 'start')).toMatchObject({ path: 'main.py', line: 9, document: 'README.md', section: 'start' });
  expect(stepFor({ ...ref, status: 'missing' }, 'README.md', 'start')).toBeNull();
});
it('roundtrips saved guides and rejects an invalid resume position', () => {
  const guide = { name: 'Découverte', steps: [stepFor(ref, 'README.md', 'start')!], index: 0 };
  localStorage.setItem(guideKey(snapshot), JSON.stringify([guide]));
  expect(readGuides(snapshot)).toEqual([guide]);
  expect(validGuides([{ ...guide, index: 1 }])).toBe(false);
  expect(validGuides([{ ...guide, steps: [] }])).toBe(false);
});
it('includes guides in backups with validation', () => {
  const guide = { name: 'Découverte', steps: [stepFor(ref, 'README.md', 'start')!], index: 0 };
  const backup = { format: 'codemotion-backup', version: 1, sessions: [], snapshots: [], storage: { [guideKey(snapshot)]: JSON.stringify([guide]) } };
  expect(parseBackup(JSON.stringify(backup)).storage[guideKey(snapshot)]).toBeTruthy();
  backup.storage[guideKey(snapshot)] = JSON.stringify([{ ...guide, index: -1 }]);
  expect(() => parseBackup(JSON.stringify(backup))).toThrow('Guide invalide');
});

it('persists notes and completion while rejecting malformed backup fields', () => {
 const step = { ...stepFor(ref, 'README.md', 'start')!, note: 'Inspecter le retour', completed: true };
 const guide = { name: 'Notes', steps: [step], index: 0 };
 localStorage.setItem(guideKey(snapshot), JSON.stringify([guide]));
 expect(readGuides(snapshot)[0].steps[0]).toEqual(step);
 expect(validGuides([{ ...guide, steps: [{ ...step, note: 'x'.repeat(2001) }] }])).toBe(false);
 expect(validGuides([{ ...guide, steps: [{ ...step, completed: 'yes' }] }])).toBe(false);
});
