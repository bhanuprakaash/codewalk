export type Kind =
  | 'start'
  | 'func'
  | 'type'
  | 'store'
  | 'outside'
  | 'you'
  | 'output'
  | 'exit'
  | 'ui'
  | 'service'
  | 'package'
  | 'client'
  | 'lb'
  | 'cache'
  | 'db'
  | 'queue'
  | 'cdn'
  | 'worker'
  | 'external'
  | 'topic';
export type Pt = { x: number; y: number };
export type Lines = [number, number][];

export interface CodeBlock {
  path?: string;
  start: number;
  lines: string[];
  hl?: Lines;
}
export interface Err {
  text: string;
  line: number;
  cond?: string;
  from?: string;
}
export interface Go {
  line: number;
  callee?: string;
  text: string;
}
export interface Why {
  text: string;
  source: { kind: string; ref?: string; title?: string };
}
export interface WalkNode {
  id: string;
  kind: Kind;
  label: string;
  sub?: string;
  what?: string;
  gotcha?: string;
  why?: Why;
  pkg?: string;
  symbol?: string;
  path?: string;
  line?: number;
  sig?: string;
  recv?: string;
  type?: string;
  errs?: Err[];
  gos?: Go[];
  locks?: string[];
  selects?: { line: number; text: string }[];
  code?: CodeBlock;
  icon?: string;
  types?: string[];
  drill?: string;
  pros?: string[];
  cons?: string[];
  body?: string;
  link?: string;
}
export interface Method {
  name: string;
  symbol: string;
  sig: string;
  doc?: string;
  path: string;
  line: number;
  errs: Err[];
  gos: Go[];
  locks: string[];
  selects?: { line: number; text: string }[];
  code: CodeBlock;
}
export interface Pattern {
  id: string;
  name: string;
  what: string;
  sites: { symbol: string; label: string }[];
}
export interface WalkType {
  symbol: string;
  name: string;
  kind: string;
  doc?: string;
  role?: string;
  path: string;
  line: number;
  fields: { name: string; type: string; doc?: string; line: number }[];
  methods: Method[];
  implementedBy: string[];
  code: CodeBlock;
}
export type EdgeKind = 'call' | 'when' | 'go' | 'stores' | 'asks';
export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  cond?: string;
  skip?: string;
  proto?: string;
  what?: string;
  at?: CodeBlock & { path: string; hl: Lines };
}
export interface Value {
  name: string;
  type: string;
  typeRef?: string | null;
  dir?: 'in' | 'out';
  note?: string;
  value: unknown;
  from?: { kind: 'captured' | 'constructed'; ref: string; at?: string };
}
export interface Goroutine {
  id: number;
  fn: string;
  at: string;
}
export interface DelveState {
  stop: number;
  of: number;
  goroutine: number;
  items: { owner: string; name: string; note?: string; value: unknown }[];
  goroutines: Goroutine[];
}
export interface Step {
  at: string;
  title: string;
  does?: string;
  note?: string;
  jump?: string;
  stop?: { path: string; line: number } | null;
  values: Value[];
  state?: DelveState | null;
  // map steps only
  back?: boolean;
  carries?: string;
  tag?: string;
  tone?: Tone;
  ms?: number;
  held?: Held[];
  total?: number;
}
export type Tone = 'ok' | 'warn' | 'bad' | 'info';
// what the system holds after a map step, carried forward from the steps before it
export interface Held {
  of?: string;
  name: string;
  value: unknown;
  note?: string;
  chg?: boolean;
  gone?: boolean;
}
export interface WhatIf {
  id: string;
  title: string;
  summary: string;
  fork: number;
  trace: Step[];
}
export interface Workflow {
  id: string;
  title: string;
  summary: string;
  capturedAt?: string;
  nodes: string[];
  pos: Record<string, Pt>;
  edges: Edge[];
  trace: Step[];
  whatifs?: WhatIf[];
}
export interface Walk {
  title: string;
  scope: string;
  summary: string;
  repo: string;
  commit: string;
  dirty: boolean;
  capturedAt: string;
  goroutineNotes: Record<string, string>;
  packages: { dir: string; name: string; doc: string; role?: string; nodes: string[] }[];
  nodes: Record<string, WalkNode>;
  types: Record<string, WalkType>;
  funcs?: Record<string, Method>;
  workflows: Workflow[];
  patterns?: Pattern[];
}
export interface SystemEdge {
  id: string;
  from: string;
  to: string;
  kind: 'calls' | 'http' | 'sse' | 'mcp' | 'imports' | 'stores';
  label: string;
  what: string;
}
export interface System {
  title: string;
  summary: string;
  repo: string;
  commit: string;
  boxes: Record<string, WalkNode & { pos: Pt }>;
  edges: SystemEdge[];
  types: Record<string, WalkType>;
  funcs?: Record<string, Method>;
  patterns?: Pattern[];
}
export interface User {
  positions?: Record<string, { layout: string; nodes: Record<string, Pt> }>;
  [key: string]: unknown;
}
