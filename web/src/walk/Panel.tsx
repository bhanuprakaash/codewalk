import type { ReactNode } from 'react';

const Icon = ({ d }: { d: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

// the right panel: tabs and the history arrows around whichever card is open
export function Panel({
  open,
  hi,
  count,
  bodyKey,
  tab,
  onGo,
  onTab,
  onClose,
  children,
}: {
  open: boolean;
  hi: number;
  count: number;
  bodyKey: string;
  tab: 'details' | 'ask';
  onGo(d: number): void;
  onTab(tab: 'details' | 'ask'): void;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <aside id="panel" className={open ? 'open' : ''}>
      <div id="ptabs">
        <button
          className="nav"
          title="Back to the first card"
          disabled={hi <= 0}
          onClick={() => onGo(-hi)}
        >
          <Icon d="M3 3 L3 13 M12 3 L7 8 L12 13" />
        </button>
        <button className="nav" title="Back (Alt+←)" disabled={hi <= 0} onClick={() => onGo(-1)}>
          <Icon d="M10 3 L5 8 L10 13" />
        </button>
        <button
          className="nav"
          title="Forward (Alt+→)"
          disabled={hi < 0 || hi >= count - 1}
          onClick={() => onGo(1)}
        >
          <Icon d="M6 3 L11 8 L6 13" />
        </button>
        <span id="navPos">{count > 1 ? `${hi + 1}/${count}` : ''}</span>
        <button className={tab === 'details' ? 'on' : ''} onClick={() => onTab('details')}>
          Details
        </button>
        <button className={tab === 'ask' ? 'on' : ''} onClick={() => onTab('ask')}>
          Ask
        </button>
        <button className="x" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      <div id="pbody" key={bodyKey}>
        {open && children}
      </div>
    </aside>
  );
}
