import { clamp } from './graph';
import type { Step, Walk, Workflow } from './types';

export type Entry =
  | { k: 'node' | 'type' | 'method'; id: string }
  | { k: 'edge'; id: string; wf: string }
  | { k: 'step'; id: number; wf: string; wi?: string };

export interface Nav {
  view: string;
  tr: number;
  wi: string | null;
  hist: Entry[];
  hi: number;
  open: boolean;
  tab: 'details' | 'ask';
}

export type Action =
  | { t: 'show'; view: string }
  | { t: 'open'; entry: Entry; untrace?: boolean }
  | { t: 'trace'; i: number; wi?: string | null }
  | { t: 'stop' }
  | { t: 'close' }
  | { t: 'go'; d: number }
  | { t: 'tab'; tab: Nav['tab'] };

export const OVERVIEW = 'overview';
export const initNav = (view: string): Nav => ({
  view,
  tr: -1,
  wi: null,
  hist: [],
  hi: -1,
  open: false,
  tab: 'details',
});

export const workflowOf = (walk: Walk, view: string) =>
  walk.workflows.find((w) => w.id === view) ?? null;
export const traceOf = (wf: Workflow, wi: string | null): Step[] =>
  wf.whatifs?.find((x) => x.id === wi)?.trace ?? wf.trace;

const closed = { open: false, hist: [], hi: -1 };
const same = (a: Entry, b: Entry) =>
  a.k === b.k &&
  a.id === b.id &&
  (a as { wf?: string }).wf === (b as { wf?: string }).wf &&
  (a as { wi?: string }).wi === (b as { wi?: string }).wi;

function record(s: Nav, e: Entry): Nav {
  const cur = s.hist[s.hi];
  if (cur && same(cur, e)) return s;
  const hist = s.hist.slice(0, s.hi + 1);
  if (cur && cur.k === 'step' && e.k === 'step' && cur.wi === e.wi) hist[s.hi] = e;
  else hist.push(e);
  return { ...s, hist, hi: hist.length - 1 };
}

export function reducer(walk: Walk) {
  const show = (s: Nav, view: string): Nav => ({
    ...s,
    view: workflowOf(walk, view) ? view : OVERVIEW,
    tr: -1,
    wi: null,
    tab: 'details',
    ...closed,
  });

  function trace(s: Nav, i: number, wi: string | null): Nav {
    const wf = workflowOf(walk, s.view);
    if (!wf) return s;
    const fork = wf.whatifs?.find((x) => x.id === wi)?.fork;
    if (wi && i < 0 && fork !== undefined) return trace(s, fork, null);
    if (!traceOf(wf, wi).length) return s;
    const tr = clamp(i, 0, traceOf(wf, wi).length - 1);
    const entry: Entry = { k: 'step', id: tr, wf: s.view, ...(wi ? { wi } : {}) };
    return record({ ...s, tr, wi, open: true, tab: 'details' }, entry);
  }

  return (s: Nav, a: Action): Nav => {
    switch (a.t) {
      case 'show':
        return show(s, a.view);
      case 'open':
        return record(
          { ...s, open: true, tab: 'details', ...(a.untrace ? { tr: -1, wi: null } : {}) },
          a.entry,
        );
      case 'trace':
        return trace(s, a.i, a.wi === undefined ? s.wi : a.wi);
      case 'stop': {
        const fork = workflowOf(walk, s.view)?.whatifs?.find((x) => x.id === s.wi)?.fork;
        if (s.wi && fork !== undefined) return trace(s, fork, null);
        return { ...s, tr: -1, ...closed };
      }
      case 'close':
        return { ...s, ...closed };
      case 'go': {
        const e = s.hist[s.hi + a.d];
        if (!e) return s;
        let n: Nav = { ...s, hi: s.hi + a.d, open: true, tab: 'details' };
        if ((e.k === 'edge' || e.k === 'step') && e.wf !== n.view) {
          n = { ...n, view: e.wf, tr: -1, wi: null };
        }
        if (e.k === 'step') n = { ...n, tr: e.id, wi: e.wi ?? null };
        return n;
      }
      case 'tab':
        return { ...s, open: true, tab: a.tab };
    }
  };
}
