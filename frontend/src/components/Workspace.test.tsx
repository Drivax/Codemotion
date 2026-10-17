import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Workspace from './Workspace';
import { api } from '@/lib/api';
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/api', () => ({ API: '', api: vi.fn(), post: vi.fn(async () => ({ id: 'job', status: 'running' })) }));
const source = { file: 'test.py', start_line: 1, end_line: 3, start_column: 0, end_column: 0 };
const nodes = ['Car', 'drive', 'stop'].map((name, i) => ({ id: name, name, qualified_name: name, kind: i ? 'Method' : 'Class', source, metadata: {}, signature: '', docstring: '' }));
it('opens the selected method from the flow tab, including after another flow was opened', async () => {
  vi.mocked(api).mockImplementation(async path => {
    let data: unknown;
    if (path === '/jobs/job') data = { status: 'completed', repository_id: 'r' };
    else if (path === '/repositories/r') data = { repository: { id: 'r', name: 'test', snapshot: '1234567' }, files: [{ path: 'test.py', parsed: true }], diagnostics: [], metrics: { total_ms: 1 } };
    else if (path.includes('/neighborhood') || path.includes('/hierarchy')) data = { nodes, edges: [], total: 3 };
    else if (path.includes('/symbols?')) data = { items: nodes, total: 3 };
    else if (path.includes('/symbols/')) data = { symbol: nodes.find(n => n.id === path.split('/').at(-1)), children: [], relations: [] };
    else if (path.includes('/flows/')) { const id = path.split('/').at(-1)!; data = { function_id: id, entry: id, operations: [{ id, kind: 'input', expression: id + ' input', source, reads: [], writes: [], definitions: {}, literal: null, calls: [] }], edges: [], limitations: [] }; }
    else data = { source: '' };
    return data as never;
  });
  render(<Workspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Explorer l’exemple' }));
  const tab = await screen.findByRole('button', { name: 'Lecteur de flux' });
  expect(tab).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher des symboles' }), { target: { value: 'drive' } });
  for (const method of ['drive', 'stop']) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher des symboles' }), { target: { value: method } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(method + '.*test.py') }));
    expect(tab).toBeEnabled();
    fireEvent.click(tab);
    expect(await screen.findByText(method + ' input')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspecteur d’objets' }));
  }
});

