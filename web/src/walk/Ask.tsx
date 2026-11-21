import { useRef, useState, type ReactNode } from 'react';
import { Code } from './Code';
import type { CodeBlock } from './types';

export interface AskEntry {
  id: number;
  question: string;
  context: string;
  steps: string[];
  answer: string;
  error?: string;
  pending: boolean;
}

export function useAsk(query: string) {
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const session = useRef<string | null>(null);
  const asking = useRef(false);

  async function ask(question: string, context: string[]) {
    if (asking.current) return;
    asking.current = true;
    const id = Date.now();
    const patch = (p: (e: AskEntry) => Partial<AskEntry>) =>
      setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p(e) } : e)));
    setEntries((es) => [
      ...es,
      { id, question, context: context[context.length - 1], steps: [], answer: '', pending: true },
    ]);
    try {
      const res = await fetch(`/api/ask?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, context: { lines: context }, session: session.current }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? res.statusText);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const m = JSON.parse(buf.slice(0, k));
          buf = buf.slice(k + 1);
          if (m.step) patch((e) => ({ steps: [...e.steps, m.step] }));
          if (m.text) patch(() => ({ answer: m.text }));
          if (m.done) {
            if (m.error) patch(() => ({ error: m.error, pending: false }));
            else {
              session.current = m.session || session.current;
              patch(() => ({ answer: m.answer || '', pending: false }));
            }
          }
        }
      }
    } catch (err) {
      patch(() => ({ error: `Could not reach the codewalk server: ${(err as Error).message}` }));
    }
    patch(() => ({ pending: false }));
    asking.current = false;
  }
  return { entries, ask };
}

const REF = /([\w@./-]+\.(?:go|tsx?|jsx?|mjs|sql|md|json|ya?ml)):(\d+)(?:[-–](\d+))?/g;

function Refs({ text, onRef }: { text: string; onRef(path: string, line: number): void }) {
  const out: ReactNode[] = [];
  let i = 0;
  for (const m of text.matchAll(REF)) {
    out.push(text.slice(i, m.index));
    out.push(
      <a key={m.index} onClick={() => onRef(m[1], +m[2])}>
        {m[0]}
      </a>,
    );
    i = m.index + m[0].length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

function Answer({ text, onRef }: { text: string; onRef(path: string, line: number): void }) {
  return text.split(/```\w*\n?([\s\S]*?)```/).map((part, k) =>
    k % 2 ? (
      <pre key={k}>{part.replace(/\n$/, '')}</pre>
    ) : (
      part.split(/(`[^`]+`)/).map((s, j) =>
        s.length > 2 && s.startsWith('`') && s.endsWith('`') ? (
          <code key={`${k}.${j}`}>
            <Refs text={s.slice(1, -1)} onRef={onRef} />
          </code>
        ) : (
          <Refs key={`${k}.${j}`} text={s} onRef={onRef} />
        ),
      )
    ),
  );
}

export function Ask({
  entries,
  query,
  onAsk,
}: {
  entries: AskEntry[];
  query: string;
  onAsk(question: string): void;
}) {
  const [text, setText] = useState('');
  const [ref, setRef] = useState<{ code: CodeBlock; path: string; line: number } | null>(null);

  async function openRef(path: string, line: number) {
    const res = await fetch(`/api/code?${query}&path=${encodeURIComponent(path)}&line=${line}`);
    if (res.ok) setRef({ code: await res.json(), path, line });
  }
  const submit = () => {
    const q = text.trim();
    if (!q || entries.some((e) => e.pending)) return;
    setText('');
    onAsk(q);
  };

  if (ref) {
    return (
      <>
        <div className="card-h">
          <div className="gl" style={{ background: 'var(--muted)' }}>
            ‹›
          </div>
          <h2>
            {ref.path}:{ref.line}
          </h2>
        </div>
        <div className="loc">
          from an answer · <a onClick={() => setRef(null)}>back to Ask</a>
        </div>
        <Code code={ref.code} />
      </>
    );
  }
  return (
    <>
      <div className="sec" style={{ marginTop: 0 }}>
        <div className="h">Ask Claude · answers read the repo</div>
      </div>
      <div id="askLog">
        {entries.map((e) => (
          <div key={e.id}>
            <div className="q">
              {e.question}
              <span>{e.context}</span>
            </div>
            {e.steps.length > 0 && <div className="steps">{e.steps.join(' · ')}</div>}
            <div className="a">
              {e.error ? (
                <span style={{ color: 'var(--data)' }}>{e.error}</span>
              ) : e.pending && !e.answer ? (
                <span className="steps">thinking…</span>
              ) : (
                <Answer text={e.answer} onRef={openRef} />
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        id="askForm"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <textarea
          id="askInput"
          autoFocus
          value={text}
          placeholder="Ask about what you are looking at… (Enter to send)"
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit">Ask</button>
      </form>
    </>
  );
}
