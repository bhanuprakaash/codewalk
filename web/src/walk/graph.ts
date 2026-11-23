import type { Kind, Pt } from './types';

export type GEdge = {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  cond?: string;
};
export type Graph = { nodes: string[]; edges: GEdge[]; pos: Record<string, Pt> };

export const NW = 210;
export const NH = 58;
const BRIEF_LINE = 14;
const BRIEF_CHARS = 30;

// splits a node's brief into at most three lines that fit the box
export function briefLines(brief?: string): string[] {
  if (!brief) return [];
  const lines: string[] = [];
  let cur = '';
  for (const w of brief.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > BRIEF_CHARS) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = lines[2].slice(0, BRIEF_CHARS - 1) + '…';
  }
  return lines;
}
export const nodeH = (brief?: string) => {
  const n = briefLines(brief).length;
  return n ? NH + 6 + n * BRIEF_LINE : NH;
};
export const BRIEF_TOP = NH - 4;
export { BRIEF_LINE };

export const KIND: Record<Kind, { name: string }> = {
  start: { name: 'Starts' },
  func: { name: 'Function' },
  type: { name: 'Type' },
  store: { name: 'Stores' },
  outside: { name: 'Outside' },
  you: { name: 'Stops for you' },
  output: { name: 'Output' },
  exit: { name: 'Early exit' },
  ui: { name: 'UI' },
  service: { name: 'Service' },
  package: { name: 'Package' },
  client: { name: 'Client' },
  lb: { name: 'Load balancer' },
  cache: { name: 'Cache' },
  db: { name: 'Database' },
  queue: { name: 'Queue' },
  cdn: { name: 'CDN' },
  worker: { name: 'Worker' },
  external: { name: 'External' },
  topic: { name: 'Topic' },
};
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ease = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const textWidth = (s: string, px: number) => s.length * px * 0.6 + 14;

type Anchor = Pt & { h: boolean; s: number };
function anchor(a: Pt, b: Pt, h: number): Anchor {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) * h > Math.abs(dy) * NW) {
    return { x: a.x + (Math.sign(dx) * NW) / 2, y: a.y, h: true, s: Math.sign(dx) };
  }
  return { x: a.x, y: a.y + (Math.sign(dy || 1) * h) / 2, h: false, s: Math.sign(dy || 1) };
}

export function curve(a: Pt, b: Pt, bent: boolean, ha = NH, hb = NH): Pt[] {
  const p0 = anchor(a, b, ha);
  const p3 = anchor(b, a, hb);
  const d = Math.max(36, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.38);
  const c = (p: Anchor) => (p.h ? { x: p.x + p.s * d, y: p.y } : { x: p.x, y: p.y + p.s * d });
  let c1 = c(p0);
  let c2 = c(p3);
  if (bent) {
    const nx = -(p3.y - p0.y);
    const ny = p3.x - p0.x;
    const len = Math.hypot(nx, ny) || 1;
    const k = 46;
    c1 = { x: c1.x + (nx / len) * k, y: c1.y + (ny / len) * k };
    c2 = { x: c2.x + (nx / len) * k, y: c2.y + (ny / len) * k };
  }
  return [p0, c1, c2, p3];
}

export function bez(Q: Pt[], t: number): Pt {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: w[0] * Q[0].x + w[1] * Q[1].x + w[2] * Q[2].x + w[3] * Q[3].x,
    y: w[0] * Q[0].y + w[1] * Q[1].y + w[2] * Q[2].y + w[3] * Q[3].y,
  };
}

export const pathOf = (Q: Pt[]) =>
  `M${Q[0].x},${Q[0].y} C${Q[1].x},${Q[1].y} ${Q[2].x},${Q[2].y} ${Q[3].x},${Q[3].y}`;

export const isBent = (wf: Graph, e: GEdge) =>
  e.kind === 'asks' ||
  (e.from > e.to && wf.edges.some((x) => x !== e && x.from === e.to && x.to === e.from));

export const edgeText = (e: GEdge) =>
  e.cond ? `${e.cond}${e.label ? ' → ' + e.label : ''}` : (e.label ?? '');

export function fitLabel(text: string, Q: Pt[], full: boolean) {
  const room = Math.max(40, Math.hypot(Q[3].x - Q[0].x, Q[3].y - Q[0].y) - 18);
  let t = text;
  if (!full && textWidth(t, 10.5) > room) {
    t = t.slice(0, Math.max(3, Math.floor((room - 14) / (10.5 * 0.6)) - 1)) + '…';
  }
  return { text: t, width: textWidth(t, 10.5) };
}

export function neighbourhood(wf: Graph, id: string) {
  const ids = new Set([id]);
  const es = new Set<string>();
  for (const e of wf.edges) {
    if (e.from === id || e.to === id) {
      ids.add(e.from).add(e.to);
      es.add(e.id);
    }
  }
  return { ids, es };
}

export function boxOf(
  P: Record<string, Pt>,
  ids: Iterable<string>,
  hOf: (id: string) => number = () => NH,
) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const p = P[id];
    if (!p) continue;
    x0 = Math.min(x0, p.x - NW / 2);
    x1 = Math.max(x1, p.x + NW / 2);
    y0 = Math.min(y0, p.y - hOf(id) / 2);
    y1 = Math.max(y1, p.y + hOf(id) / 2);
  }
  return { x0, y0, x1, y1 };
}

// saved drags belong to the layout they were made on; a rebuild with new positions starts fresh
export function layoutOf(wf: Graph) {
  let h = 0;
  for (const c of JSON.stringify(wf.pos)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return String(h);
}
