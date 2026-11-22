import { useEffect, useId, useRef, useState } from 'react';

// A listbox dropdown: arrows move, Enter or Space picks, Esc or a click outside closes,
// Home/End jump, and typing a letter goes to the next option starting with it.
export function Select({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current?.contains(e.target as Node) || setOpen(false);
    addEventListener('pointerdown', away);
    list.current?.focus();
    return () => removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const show = () => {
    setActive(Math.max(0, options.indexOf(cur!)));
    setOpen(true);
  };
  const pick = (i: number) => {
    setOpen(false);
    btn.current?.focus();
    if (options[i] && options[i].value !== value) onChange(options[i].value);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = options.length;
    const move = (i: number) => {
      e.preventDefault();
      setActive((i + n) % n);
    };
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      for (let d = 1; d <= n; d++) {
        if (options[(active + d) % n].label.toLowerCase().startsWith(k)) return move(active + d);
      }
    }
  };

  return (
    <div className="select" ref={box}>
      <button
        ref={btn}
        type="button"
        className="select-btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={cur ? 'v' : 'v ph'}>{cur?.label ?? placeholder}</span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 10l5 5 5-5" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          className="select-pop"
          onKeyDown={onKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'act' : undefined}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="ol">{o.label}</span>
              {o.value === value && (
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </li>
          ))}
          {!options.length && <li className="empty">No projects</li>}
        </ul>
      )}
    </div>
  );
}
