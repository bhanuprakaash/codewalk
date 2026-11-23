import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import {
  BRIEF_LINE,
  BRIEF_TOP,
  NH,
  NW,
  bez,
  briefLines,
  boxOf,
  curve,
  edgeText,
  ease,
  type Graph,
  fitLabel,
  isBent,
  lerp,
  neighbourhood,
  nodeH,
  pathOf,
  textWidth,
} from './graph';
import { PHONE } from '../route';
import type { Entry } from './nav';
import { BoxIcon } from './icons';
import type { Pt, Step, WalkNode } from './types';

export interface CanvasHandle {
  fit(ids: string[], minHalf?: number): void;
  fitAll(): void;
}
type Cam = { cx: number; cy: number; hw: number; hh: number };

interface Props {
  nodes: Record<string, WalkNode>;
  wf: Graph;
  start: Record<string, Pt>;
  step: Step | null;
  stepKey: string;
  selected: Entry | null;
  onNode(id: string): void;
  onEdge(id: string): void;
  onMoved(nodes: Record<string, Pt> | null): void;
  onType?(symbol: string): void;
  marks?: Record<string, { state: string }>;
  ref: Ref<CanvasHandle>;
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function TypeChips({ types, onType }: { types: string[]; onType?(symbol: string): void }) {
  let x = -NW / 2;
  let y = NH / 2 + 6;
  return (
    <>
      {types.map((sym) => {
        const name = sym.split(':')[1];
        const w = textWidth(name, 10.5);
        if (x + w > NW / 2 && x > -NW / 2) {
          x = -NW / 2;
          y += 22;
        }
        const at = { x, y };
        x += w + 6;
        return (
          <g
            key={sym}
            className="tchip"
            transform={`translate(${at.x},${at.y})`}
            onClick={(ev) => {
              ev.stopPropagation();
              onType?.(sym);
            }}
          >
            <rect width={w} height={18} rx={9} />
            <text x={7} y={12.5}>
              {name}
            </text>
          </g>
        );
      })}
    </>
  );
}

export function Canvas({
  nodes,
  wf,
  start,
  step,
  stepKey,
  selected,
  onNode,
  onEdge,
  onMoved,
  onType,
  marks,
  ref,
}: Props) {
  const [P, setP] = useState(start);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const packet = useRef<SVGGElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const lines = useRef(new Map<string, SVGPathElement>());
  const cam = useRef<Cam | null>(null);
  const target = useRef<Cam | null>(null);
  const dragged = useRef(false);
  const trStart = useRef(0);

  const curves = useMemo(
    () =>
      new Map(
        wf.edges.map((e) => [
          e.id,
          curve(
            P[e.from],
            P[e.to],
            isBent(wf, e),
            nodeH(nodes[e.from]?.brief),
            nodeH(nodes[e.to]?.brief),
          ),
        ]),
      ),
    [wf, P, nodes],
  );
  const stepEdge = step && wf.edges.find((e) => e.id === step.at);
  // read by the animation loop, which outlives any one render
  const live = useRef({ P, curves, step, stepEdge });
  live.current = { P, curves, step, stepEdge };

  const fit = (ids: Iterable<string>, minHalf = 380, now = false, clear = false) => {
    // a narrow canvas zooms in further, so a node's text stays readable on a phone
    const width = svg.current?.getBoundingClientRect().width;
    if (width && matchMedia(PHONE).matches) minHalf = Math.min(minHalf, width / 1.8);
    const r = boxOf(live.current.P, ids, (id) => nodeH(nodes[id]?.brief));
    let t = {
      cx: (r.x0 + r.x1) / 2,
      cy: (r.y0 + r.y1) / 2,
      hw: Math.max((r.x1 - r.x0) / 2 + 80, minHalf),
      hh: (r.y1 - r.y0) / 2 + 90,
    };
    const el = svg.current;
    const card = clear
      ? el?.parentElement?.querySelector('#summary')?.getBoundingClientRect()
      : null;
    if (el && card?.width) {
      // place the graph right of the summary card or below it, whichever shows it bigger
      const v = el.getBoundingClientRect();
      const l = card.right - v.left + 16;
      const tp = card.bottom - v.top + 8;
      const regions = [
        // 60 px on the right and 40 at the bottom stay clear for the zoom buttons and bars
        { x: l, y: 0, w: v.width - l - 60, h: v.height - 40 },
        { x: 0, y: tp, w: v.width - 60, h: v.height - tp - 40 },
      ];
      const scale = (g: (typeof regions)[0]) => Math.min(g.w / (2 * t.hw), g.h / (2 * t.hh));
      const g = regions.reduce((a, b) => (scale(b) > scale(a) ? b : a));
      if (scale(g) > 0) {
        const k = scale(g);
        const hw = v.width / (2 * k);
        const hh = v.height / (2 * k);
        t = { cx: t.cx - (g.x + g.w / 2) / k + hw, cy: t.cy - (g.y + g.h / 2) / k + hh, hw, hh };
      }
    }
    target.current = t;
    if (now || !cam.current) cam.current = { ...target.current };
  };
  const fitAll = () => fit(wf.nodes, 300, false, true);
  useImperativeHandle(ref, () => ({ fit: (ids, minHalf) => fit(ids, minHalf), fitAll }));

  useEffect(() => {
    fit(wf.nodes, 300, true, true);
    // a wide graph on a phone opens on its left end at a readable size, not as a thin strip
    const v = svg.current!.getBoundingClientRect();
    const c = cam.current!;
    const shown = Math.max(2 * c.hw, (2 * c.hh * v.width) / v.height);
    const z = v.width / shown / 0.5;
    if (matchMedia(PHONE).matches && z < 1) {
      cam.current = target.current = {
        cx: c.cx - (shown / 2) * (1 - z),
        cy: c.cy,
        hw: c.hw * z,
        hh: c.hh * z,
      };
    }
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const el = svg.current;
      if (!el || !cam.current) return;
      if (target.current) {
        const t = target.current;
        const c = cam.current;
        cam.current = {
          cx: lerp(c.cx, t.cx, 0.16),
          cy: lerp(c.cy, t.cy, 0.16),
          hw: lerp(c.hw, t.hw, 0.16),
          hh: lerp(c.hh, t.hh, 0.16),
        };
      }
      const { cx, cy, hw, hh } = cam.current;
      const { width: W, height: H } = el.getBoundingClientRect();
      let w = hw * 2;
      let h = hh * 2;
      if (W && H) {
        if (w / h > W / H) h = (w * H) / W;
        else w = (h * W) / H;
      }
      el.setAttribute('viewBox', `${cx - w / 2} ${cy - h / 2} ${w} ${h}`);

      const { curves, step, stepEdge } = live.current;
      if (stepEdge)
        lines.current
          .get(stepEdge.id)
          ?.style.setProperty(
            'stroke-dashoffset',
            String(((step?.back ? 1 : -1) * now * 30) / 1000),
          );
      if (!step || !stepEdge) {
        packet.current?.setAttribute('opacity', '0');
        dot.current?.setAttribute('opacity', '0');
        return;
      }
      const t = Math.min(1, ease((((now - trStart.current) / 1600) % 1) * 1.1));
      const pt = bez(curves.get(stepEdge.id)!, step.back ? 1 - t : t);
      packet.current?.setAttribute('transform', `translate(${pt.x + 10},${pt.y - 24})`);
      packet.current?.setAttribute('opacity', '1');
      dot.current?.setAttribute('cx', String(pt.x));
      dot.current?.setAttribute('cy', String(pt.y));
      dot.current?.setAttribute('opacity', '1');
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!step) return;
    trStart.current = performance.now();
    setHover(null);
    fit(stepEdge ? [stepEdge.from, stepEdge.to] : [step.at], 420);
  }, [stepKey]);

  const toWorld = (ev: { clientX: number; clientY: number }) => {
    const vb = svg.current!.viewBox.baseVal;
    const r = svg.current!.getBoundingClientRect();
    return {
      x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width,
      y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height,
    };
  };
  const zoomAt = (p: Pt, z: number) => {
    const c = cam.current!;
    target.current = null;
    cam.current = {
      cx: p.x + (c.cx - p.x) * z,
      cy: p.y + (c.cy - p.y) * z,
      hw: c.hw * z,
      hh: c.hh * z,
    };
  };
  useEffect(() => {
    const el = svg.current!;
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      zoomAt(toWorld(ev), Math.exp(ev.deltaY * 0.0015));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  // fingers on the canvas: one pans, two pinch
  const fingers = useRef(new Map<number, Pt>());
  const pinching = useRef(false);
  const byTouch = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (fingers.current.has(e.pointerId))
        fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const end = (e: PointerEvent) => {
      fingers.current.delete(e.pointerId);
      if (!fingers.current.size) pinching.current = false;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
    };
  }, []);
  const pinch = () => {
    const el = svg.current!;
    const [a, b] = [...fingers.current.keys()];
    const read = () => {
      const p = fingers.current.get(a);
      const q = fingers.current.get(b);
      if (!p || !q) return null;
      return { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    };
    const s = read()!;
    const c0 = { ...cam.current! };
    const p0 = toWorld({ clientX: s.x, clientY: s.y });
    const k = el.viewBox.baseVal.width / el.getBoundingClientRect().width;
    pinching.current = true;
    dragged.current = true;
    target.current = null;
    const move = () => {
      const n = read();
      if (!n) return;
      const z = s.d / n.d;
      cam.current = {
        cx: p0.x + (c0.cx - p0.x) * z - (n.x - s.x) * k * z,
        cy: p0.y + (c0.cy - p0.y) * z - (n.y - s.y) * k * z,
        hw: c0.hw * z,
        hh: c0.hh * z,
      };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== a && e.pointerId !== b) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      setTimeout(() => (dragged.current = false), 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const pointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    const t = ev.target as Element;
    const touch = ev.pointerType === 'touch';
    // a finger pans from anywhere, edges included: zoomed in, they cover much of a phone's canvas
    if (ev.button !== 0 || (!touch && t.closest('.edge'))) return;
    byTouch.current = touch;
    if (touch) {
      fingers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (fingers.current.size === 2) return pinch();
      if (fingers.current.size > 2) return;
    }
    // a finger on a node pans like anywhere else: only a mouse moves nodes
    const id = touch ? undefined : t.closest<SVGElement>('.node')?.dataset.id;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const orig = id ? { ...P[id] } : null;
    const c0 = { ...cam.current! };
    let moved: Pt | null = null;
    dragged.current = false;
    target.current = null;
    const el = svg.current!;
    if (!id) el.classList.add('panning');
    const move = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId || pinching.current) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4) dragged.current = true;
      if (!dragged.current) return;
      const k = el.viewBox.baseVal.width / el.getBoundingClientRect().width;
      const dx = (e.clientX - sx) * k;
      const dy = (e.clientY - sy) * k;
      if (id && orig) {
        moved = { x: orig.x + dx, y: orig.y + dy };
        setP((p) => ({ ...p, [id]: moved! }));
      } else cam.current = { ...c0, cx: c0.cx - dx, cy: c0.cy - dy };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      el.classList.remove('panning');
      if (id && moved) onMoved({ ...live.current.P, [id]: moved });
      setTimeout(() => (dragged.current = false), 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const focusId = hover ?? (step ? null : selected?.k === 'node' ? selected.id : null);
  const hood = focusId && wf.nodes.includes(focusId) ? neighbourhood(wf, focusId) : null;
  const stepNode = step && wf.nodes.includes(step.at) ? step.at : null;
  const selEdge = selected?.k === 'edge' ? selected.id : null;

  const pill = (text: string, Q: Pt[], full: boolean) => {
    const f = fitLabel(text, Q, full);
    const m = bez(Q, 0.5);
    return (
      <g className="pill" transform={`translate(${m.x},${m.y})`}>
        <rect y={-9} height={18} rx={9} x={-f.width / 2} width={f.width} />
        <text x={0} y={3.6} textAnchor="middle">
          {f.text}
        </text>
      </g>
    );
  };
  const packetLabel = step ? (step.values.find((v) => v.dir === 'out') ?? step.values[0]) : null;
  const packetText = step?.carries ?? (packetLabel?.type || packetLabel?.name || '');
  // the step's badge (HIT, MISS…) sits over the node where it happens, or the edge's target
  const tagAt = step?.tag && (stepNode ?? (stepEdge && (step.back ? stepEdge.from : stepEdge.to)));

  return (
    <>
      <svg
        id="stage"
        ref={svg}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={pointerDown}
        onDoubleClick={(ev) => {
          if ((ev.target as Element).closest('.node')) return;
          // a double tap only refits: it must not throw away a saved layout
          if (byTouch.current) return fitAll();
          live.current.P = { ...wf.pos };
          setP({ ...wf.pos });
          onMoved(null);
          fitAll();
        }}
      >
        <defs>
          <marker
            id="ar"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        <g id="world">
          <g id="edges">
            {wf.edges.map((e) => {
              const Q = curves.get(e.id)!;
              const d = pathOf(Q);
              const text = edgeText(e);
              const hot = !!hood && hood.es.has(e.id);
              const isStep = stepEdge?.id === e.id || selEdge === e.id;
              const lifted = hoverEdge === e.id;
              return (
                <g
                  key={e.id}
                  className={`edge ${e.kind}${hot && !isStep ? ' hot' : ''}${isStep ? ' tr' : ''}${isStep && step ? ' anim' : ''}`}
                  style={{ opacity: step ? (isStep ? 1 : 0.2) : !hood || hot ? 1 : 0.15 }}
                >
                  <path
                    className="ln"
                    d={d}
                    markerEnd="url(#ar)"
                    ref={(el) =>
                      void (el ? lines.current.set(e.id, el) : lines.current.delete(e.id))
                    }
                  />
                  <path
                    className="hit"
                    d={d}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (dragged.current) return;
                      onEdge(e.id);
                    }}
                    onPointerEnter={() => setHoverEdge(e.id)}
                    onPointerLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}
                  />
                  {text && !lifted && pill(text, Q, false)}
                  <title>{text}</title>
                </g>
              );
            })}
          </g>
          <g id="nodes">
            {wf.nodes.map((id) => {
              const n = nodes[id];
              const inStep =
                stepNode === id || (stepEdge && (stepEdge.from === id || stepEdge.to === id));
              const exits = (n.errs ?? []).length;
              const brief = briefLines(n.brief);
              const h = nodeH(n.brief);
              const top = -h / 2;
              const sel = (selected?.k === 'node' && selected.id === id) || stepNode === id;
              const lit = !!hood && hood.ids.has(id) && id !== focusId;
              return (
                <g
                  key={id}
                  data-id={id}
                  className={`node k-${n.kind} ${n.kind}${sel ? ' sel' : ''}${lit ? ' lit' : ''}${marks?.[id]?.state === 'changed' ? ' chg' : ''}`}
                  transform={`translate(${P[id].x},${P[id].y})`}
                  style={{
                    opacity: step ? (inStep ? 1 : 0.35) : !hood || hood.ids.has(id) ? 1 : 0.25,
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (dragged.current) return;
                    onNode(id);
                    fit(neighbourhood(wf, id).ids, 340);
                  }}
                  onPointerEnter={() => !dragged.current && setHover(id)}
                  onPointerLeave={() => setHover((h) => (h === id ? null : h))}
                >
                  {marks?.[id]?.state === 'changed' && <title>changed since you last looked</title>}
                  <rect
                    className="ring"
                    x={-NW / 2 - 2}
                    y={top - 2}
                    width={NW + 4}
                    height={h + 4}
                    rx={16}
                  />
                  <rect className="box" x={-NW / 2} y={top} width={NW} height={h} rx={14} />
                  <BoxIcon icon={n.icon} kind={n.kind} x={-NW / 2 + 10} y={top + 11} size={36} />
                  <text className="lb" x={-NW / 2 + 55} y={top + (n.sub ? 26 : 34)}>
                    {trunc(n.label, 20)}
                  </text>
                  <text className="sb" x={-NW / 2 + 55} y={top + 43}>
                    {trunc(n.sub ?? '', 25)}
                  </text>
                  {brief.length > 0 && (
                    <text className="br" x={-NW / 2 + 12} y={top + BRIEF_TOP}>
                      {brief.map((l, i) => (
                        <tspan key={i} x={-NW / 2 + 12} dy={BRIEF_LINE}>
                          {l}
                        </tspan>
                      ))}
                    </text>
                  )}
                  {exits > 0 && (
                    <text
                      className="bd"
                      x={NW / 2 - 8}
                      y={top + 13}
                      textAnchor="end"
                      fill="var(--data)"
                    >
                      {exits} exit{exits > 1 ? 's' : ''}
                    </text>
                  )}
                  {(n.gos ?? []).length > 0 && (
                    <text
                      className="bd"
                      x={NW / 2 - 8}
                      y={h / 2 - 6}
                      textAnchor="end"
                      fill="var(--k-func)"
                    >
                      go
                    </text>
                  )}
                  {marks?.[id]?.state === 'removed' && (
                    <circle
                      className={`mark ${marks[id].state}`}
                      cx={-NW / 2 + 4}
                      cy={top + 4}
                      r={5}
                    >
                      <title>{marks[id].state} since you last looked</title>
                    </circle>
                  )}
                  {(n.drill || n.link) && (
                    <text
                      className="bd"
                      x={NW / 2 - 8}
                      y={top + 13}
                      textAnchor="end"
                      fill="var(--focus)"
                    >
                      opens ›
                    </text>
                  )}
                  {n.types && <TypeChips types={n.types} onType={onType} />}
                </g>
              );
            })}
          </g>
          {tagAt && P[tagAt] && (
            <g
              className={`step-tag ${step!.tone ?? 'info'}`}
              transform={`translate(${P[tagAt].x + NW / 2 - 12},${P[tagAt].y - nodeH(nodes[tagAt]?.brief) / 2 - 4})`}
            >
              <rect
                x={-textWidth(step!.tag!, 10.5)}
                y={-10}
                width={textWidth(step!.tag!, 10.5)}
                height={20}
                rx={10}
              />
              <text x={-textWidth(step!.tag!, 10.5) / 2} y={4} textAnchor="middle">
                {step!.tag}
              </text>
            </g>
          )}
          <g id="labels">
            {hoverEdge &&
              edgeText(wf.edges.find((e) => e.id === hoverEdge)!) &&
              pill(
                edgeText(wf.edges.find((e) => e.id === hoverEdge)!),
                curves.get(hoverEdge)!,
                true,
              )}
          </g>
          <g id="packets">
            <g className="packet" ref={packet} opacity={0}>
              <rect rx={9} height={18} y={-9} width={textWidth(packetText, 11)} />
              <text y={4} x={8}>
                {packetText}
              </text>
            </g>
            <circle ref={dot} r={5} fill="var(--data)" opacity={0} />
          </g>
        </g>
      </svg>
      <div id="zoom">
        <button
          title="Zoom in"
          onClick={() => zoomAt({ x: cam.current!.cx, y: cam.current!.cy }, 0.8)}
        >
          +
        </button>
        <button
          title="Zoom out"
          onClick={() => zoomAt({ x: cam.current!.cx, y: cam.current!.cy }, 1.25)}
        >
          −
        </button>
        <button title="Fit" onClick={fitAll}>
          ⤢
        </button>
      </div>
      <div id="hint">
        drag to pan · scroll to zoom · drag nodes · hover for neighbours · click for details
      </div>
    </>
  );
}
