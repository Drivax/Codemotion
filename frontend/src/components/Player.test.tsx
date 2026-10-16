import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Player from './Player';
import type { Flow } from '../lib/types';
const graph: Flow = { function_id: 'f', entry: 'a', operations: [], limitations: [], edges: [
  { source: 'a', target: 'b', kind: 'control', label: '' },
  { source: 'b', target: 'c', kind: 'control', label: 'True' },
  { source: 'b', target: 'd', kind: 'control', label: 'False' },
] };
describe('player controls', () => {
  it('steps and resets with accessible controls', () => {
    const change = vi.fn();
    render(<Player flow={graph} playback={{ trail: ['a'], index: 0 }} onChange={change} />);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(change).toHaveBeenCalledWith({ trail: ['a', 'b'], index: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset playback' }));
    expect(change).toHaveBeenLastCalledWith({ trail: ['a'], index: 0 });
  });
  it('pauses for an explicit branch selection', () => {
    const change = vi.fn();
    render(<Player flow={graph} playback={{ trail: ['a', 'b'], index: 1 }} onChange={change} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'False' }));
    expect(change).toHaveBeenCalledWith({ trail: ['a', 'b', 'd'], index: 2 });
  });
  it('plays and pauses without a network request', () => {
    vi.useFakeTimers();
    const change = vi.fn();
    render(<Player flow={graph} playback={{ trail: ['a'], index: 0 }} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    vi.advanceTimersByTime(2000);
    expect(change).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});


it('rewinds without erasing choices and navigates recorded steps', () => {
  const change = vi.fn();
  const playback = { trail: ['a', 'b', 'c'], index: 2 };
  render(<Player flow={graph} playback={playback} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(change).toHaveBeenLastCalledWith({ ...playback, index: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Décision précédente' }));
  expect(change).toHaveBeenLastCalledWith({ ...playback, index: 1 });
  fireEvent.change(screen.getByLabelText('Aller à une étape du parcours'), { target: { value: '0' } });
  expect(change).toHaveBeenLastCalledWith({ ...playback, index: 0 });
});
it('ignores keyboard shortcuts while a dialog is open', () => {
  const change = vi.fn();
  render(<><Player flow={graph} playback={{ trail: ['a'], index: 0 }} onChange={change} /><dialog open>Recherche</dialog></>);
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(change).not.toHaveBeenCalled();
});
it('manual keyboard navigation pauses autoplay', () => {
  vi.useFakeTimers();
  const change = vi.fn();
  render(<Player flow={graph} playback={{ trail: ['a'], index: 0 }} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  vi.advanceTimersByTime(2000);
  expect(change).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  vi.useRealTimers();
});
