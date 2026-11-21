import { useEffect, useRef, type ReactNode } from 'react';
import type { CodeBlock, Lines } from './types';

const KW = new Set(
  'func package import return if else for range switch case default go defer select chan map struct interface type var const break continue fallthrough nil true false'.split(
    ' ',
  ),
);
const TOKEN =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|`[^`]*`|'(?:[^'\\]|\\.)*')|(\b\d[\d_.]*\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([A-Za-z_][A-Za-z0-9_]*)/g;

function colour(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  for (const m of line.matchAll(TOKEN)) {
    const t = m[0];
    out.push(line.slice(i, m.index));
    const cls = m[1]
      ? 't-c'
      : m[2]
        ? 't-s'
        : m[3]
          ? 't-n'
          : KW.has(t)
            ? 't-k'
            : m[4]
              ? 't-f'
              : /^[A-Z]/.test(t)
                ? 't-t'
                : '';
    out.push(
      cls ? (
        <span key={m.index} className={cls}>
          {t}
        </span>
      ) : (
        t
      ),
    );
    i = m.index + t.length;
  }
  out.push(line.slice(i));
  return out;
}

export function Code({ code, hl, reveal }: { code: CodeBlock; hl?: Lines; reveal?: boolean }) {
  const ranges = hl ?? code.hl ?? [];
  const key = JSON.stringify(ranges);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.ln.hl');
    if (!el || !box.current) return;
    box.current.scrollTop = el.offsetTop - box.current.clientHeight / 3;
    if (reveal) el.scrollIntoView({ block: 'nearest' });
  }, [code, key, reveal]);
  return (
    <div className="code" ref={box}>
      {code.lines.map((text, k) => {
        const n = code.start + k;
        const on = ranges.some((r) => n >= r[0] && n <= r[1]);
        return (
          <div key={n} className={on ? 'ln hl' : 'ln'}>
            <span className="no">{n}</span>
            <span>{text ? colour(text) : ' '}</span>
          </div>
        );
      })}
    </div>
  );
}
