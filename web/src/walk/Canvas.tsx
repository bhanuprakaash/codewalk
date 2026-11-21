import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import {
  KIND,
  NH,
  NW,
  bez,
  boxOf,
  curve,
  edgeText,
  ease,
  type Graph,
  fitLabel,
  isBent,
  kc,
  lerp,
  neighbourhood,
  pathOf,
  textWidth,
} from './graph';
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
    () => new Map(wf.edges.map((e) => [e.id, curve(P[e.from], P[e.to], isBent(wf, e))])),
    [wf, P],
  );
  const stepEdge = step && wf.edges.find((e) => e.id === step.at);
  // read by the animation loop, which outlives any one render
  const live = useRef({ P, curves, step, stepEdge });
  live.current = { P, curves, step, stepEdge };

  const fit = (ids: Iterable<string>, minHalf = 380, now = false) => {
    const r = boxOf(live.current.P, ids);
    target.current = {
      cx: (r.x0 + r.x1) / 2,
      cy: (r.y0 + r.y1) / 2,
      hw: Math.max((r.x1 - r.x0) / 2 + 80, minHalf),
      hh: (r.y1 - r.y0) / 2 + 90,
    };
    if (now || !cam.current) cam.current = { ...target.current };
  };
  const fitAll = () => fit(wf.nodes, 300);
  useImperativeHandle(ref, () => ({ fit: (ids, minHalf) => fit(ids, minHalf), fitAll }));

  useEffect(() => {
    fit(wf.nodes, 300, true);
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
          ?.style.setProperty('stroke-dashoffset', String(-(now / 1000) * 30));
      if (!step || !stepEdge) {
        packet.current?.setAttribute('opacity', '0');
        dot.current?.setAttribute('opacity', '0');
        return;
      }
      const pt = bez(
        curves.get(stepEdge.id)!,
        Math.min(1, ease((((now - trStart.current) / 1600) % 1) * 1.1)),
      );
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

  const pointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    const t = ev.target as Element;
    if (ev.button !== 0 || t.closest('.edge')) return;
    const id = t.closest<SVGElement>('.node')?.dataset.id;
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
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      el.classList.remove('panning');
      if (id && moved) onMoved({ ...live.current.P, [id]: moved });
      setTimeout(() => (dragged.current = false), 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
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
  const packetText = packetLabel?.type || packetLabel?.name || '';

  return (
    <>
      <svg
        id="stage"
        ref={svg}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={pointerDown}
        onDoubleClick={(ev) => {
          if ((ev.target as Element).closest('.node')) return;
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
              const sel = (selected?.k === 'node' && selected.id === id) || stepNode === id;
              const lit = !!hood && hood.ids.has(id) && id !== focusId;
              return (
                <g
                  key={id}
                  data-id={id}
                  className={`node ${n.kind}${sel ? ' sel' : ''}${lit ? ' lit' : ''}`}
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
                  <rect className="box" x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={12} />
                  {n.icon ? (
                    <>
                      <rect className="ib" x={-NW / 2 + 10} y={-14} width={28} height={28} rx={8} />
                      <BoxIcon icon={n.icon} kind={n.kind} x={-NW / 2 + 15} y={-9} size={18} />
                    </>
                  ) : (
                    <>
                      <rect
                        x={-NW / 2 + 10}
                        y={-14}
                        width={28}
                        height={28}
                        rx={8}
                        fill={kc(n.kind)}
                      />
                      <text className="gt" x={-NW / 2 + 24} y={4.5} textAnchor="middle">
                        {KIND[n.kind].g}
                      </text>
                    </>
                  )}
                  <text className="lb" x={-NW / 2 + 48} y={-3}>
                    {trunc(n.label, 22)}
                  </text>
                  <text className="sb" x={-NW / 2 + 48} y={14}>
                    {trunc(n.sub ?? '', 30)}
                  </text>
                  {exits > 0 && (
                    <text
                      className="bd"
                      x={NW / 2 - 8}
                      y={-NH / 2 + 13}
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
                      y={NH / 2 - 6}
                      textAnchor="end"
                      fill="var(--k-func)"
                    >
                      go
                    </text>
                  )}
                  {marks?.[id] && (
                    <circle
                      className={`mark ${marks[id].state}`}
                      cx={-NW / 2 + 4}
                      cy={-NH / 2 + 4}
                      r={5}
                    >
                      <title>{marks[id].state} since you last looked</title>
                    </circle>
                  )}
                  {n.drill && (
                    <text
                      className="bd"
                      x={NW / 2 - 8}
                      y={-NH / 2 + 13}
                      textAnchor="end"
                      fill="var(--focus)"
                    >
                      opens ›
                    </text>
                  )}
                  {n.types && <TypeChips types={n.types} onType={onType} />}
                  {n.kind === 'you' && (
                    <rect
                      x={-NW / 2 - 4}
                      y={-NH / 2 - 4}
                      width={NW + 8}
                      height={NH + 8}
                      rx={15}
                      fill="none"
                      stroke="var(--you-soft)"
                      strokeWidth={6}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </g>
              );
            })}
          </g>
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
