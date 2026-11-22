import type { Edge, EdgeKind, Held, Kind, Step, Tone, Walk, WalkNode, Workflow } from './types';

// A .map.json as written (docs/maps.md). toWalk turns it into the walk shape the canvas,
// trace and cards already know, so a map is a walk with no repo.
interface MapStep {
  at: string;
  back?: boolean;
  title: string;
  does?: string;
  note?: string;
  carries?: string;
  ms?: number;
  tag?: string;
  tone?: Tone;
  values?: { name: string; value: unknown; note?: string }[];
  state?: { of?: string; name: string; value: unknown; note?: string }[];
}
export interface MapDoc {
  title: string;
  summary?: string;
  nodes: (Omit<WalkNode, 'why' | 'label'> & {
    label?: string;
    why?: string;
    pos: [number, number];
  })[];
  edges?: {
    id?: string;
    from: string;
    to: string;
    kind?: EdgeKind;
    label?: string;
    proto?: string;
    cond?: string;
    what?: string;
  }[];
  flows?: {
    id: string;
    title: string;
    summary?: string;
    nodes?: string[];
    steps?: MapStep[];
    whatifs?: { id: string; title: string; summary?: string; fork: number; steps?: MapStep[] }[];
  }[];
}

const COL = 360;
const ROW = 170;

function play(steps: MapStep[], base: Held[], t0: number): Step[] {
  let held = base;
  let total = t0;
  return steps.map((s) => {
    const next: Held[] = held.filter((h) => !h.gone).map((h) => ({ ...h, chg: false }));
    for (const x of s.state ?? []) {
      const i = next.findIndex((h) => (h.of ?? '') === (x.of ?? '') && h.name === x.name);
      if (x.value === null) {
        if (i >= 0) next[i] = { ...next[i], gone: true, chg: true };
      } else if (i >= 0) next[i] = { ...x, chg: true };
      else next.push({ ...x, chg: true });
    }
    held = next;
    total += s.ms ?? 0;
    return {
      at: s.at,
      title: s.title,
      does: s.does,
      note: s.note,
      back: s.back,
      carries: s.carries,
      tag: s.tag,
      tone: s.tone,
      ms: s.ms,
      values: (s.values ?? []).map((v) => ({
        name: v.name,
        type: '',
        value: v.value,
        note: v.note,
      })),
      held: next,
      total,
    };
  });
}

export function toWalk(doc: MapDoc): { walk: Walk; whole: Workflow } {
  const nodes: Record<string, WalkNode> = {};
  const pos: Workflow['pos'] = {};
  for (const n of doc.nodes ?? []) {
    nodes[n.id] = {
      ...n,
      kind: n.kind as Kind,
      label: n.label ?? n.id,
      why: n.why ? { text: n.why, source: { kind: 'map' } } : undefined,
    };
    pos[n.id] = { x: n.pos[0] * COL, y: n.pos[1] * ROW };
  }
  const edges: Edge[] = (doc.edges ?? []).map((e) => ({
    id: e.id ?? `${e.from}->${e.to}`,
    from: e.from,
    to: e.to,
    kind: e.kind ?? 'call',
    label: [e.label, e.proto].filter(Boolean).join(' · ') || undefined,
    cond: e.cond || undefined,
    proto: e.proto,
    what: e.what,
  }));
  const all = Object.keys(nodes);
  const graph = (ids: string[]) => ({
    nodes: ids,
    pos: Object.fromEntries(ids.map((id) => [id, pos[id]])),
    edges: edges.filter((e) => ids.includes(e.from) && ids.includes(e.to)),
  });
  const whole: Workflow = {
    id: 'map',
    title: doc.title,
    summary: doc.summary ?? '',
    ...graph(all),
    trace: [],
  };
  const workflows: Workflow[] = (doc.flows ?? []).map((f) => {
    const trace = play(f.steps ?? [], [], 0);
    return {
      id: f.id,
      title: f.title,
      summary: f.summary ?? '',
      ...graph((f.nodes ?? all).filter((id) => nodes[id])),
      trace,
      whatifs: (f.whatifs ?? []).map((w) => ({
        id: w.id,
        title: w.title,
        summary: w.summary ?? '',
        fork: w.fork,
        trace: play(w.steps ?? [], trace[w.fork]?.held ?? [], trace[w.fork]?.total ?? 0),
      })),
    };
  });
  return {
    whole,
    walk: {
      title: doc.title,
      scope: '',
      summary: doc.summary ?? '',
      repo: '',
      commit: '',
      dirty: false,
      capturedAt: '',
      goroutineNotes: {},
      packages: [],
      nodes,
      types: {},
      workflows,
    },
  };
}
