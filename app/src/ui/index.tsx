/**
 * UI primitives (docs/phases/phase-00-bootstrap.md task 0.4).
 * Small, accessible, token-styled. Text always comes from callers (i18n), never from here.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { t } from '@i18n/index';
import { Icon } from './icons';
import './ui.css';

/* ---------- Button ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'secondary', className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
}

export function IconButton({ label, className, type, children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={['icon-btn', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Chip ---------- */

interface ChipProps {
  selected: boolean;
  onToggle: (next: boolean) => void;
  /** Optional colour dot, e.g. a CAGED shape colour token. */
  swatch?: string;
  children: ReactNode;
}

export function Chip({ selected, onToggle, swatch, children }: ChipProps) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={selected}
      onClick={() => onToggle(!selected)}
    >
      {swatch ? <span className="chip__swatch" style={{ background: swatch }} /> : null}
      {children}
    </button>
  );
}

/* ---------- Tabs ---------- */

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

interface TabsProps {
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function Tabs({ label, items, value, onChange }: TabsProps) {
  const baseId = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === value);
    if (index < 0) return;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  const active = items.find((item) => item.id === value);

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((item) => (
          <button
            key={item.id}
            ref={(el) => {
              if (el) refs.current.set(item.id, el);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={item.id === value}
            aria-controls={`${baseId}-panel-${item.id}`}
            tabIndex={item.id === value ? 0 : -1}
            className="tabs__tab"
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {active ? (
        <div
          className="tabs__panel"
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
        >
          {active.panel}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Card ---------- */

interface CardProps {
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Card({ title, children, footer }: CardProps) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {children ? <div className="card__body">{children}</div> : null}
      {footer}
    </article>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

/* ---------- Dialog ---------- */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Modal built on the native <dialog>: focus trap, Escape and backdrop come from the platform. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children ? <div className="dialog__body">{children}</div> : null}
      {actions ? <div className="dialog__actions">{actions}</div> : null}
    </dialog>
  );
}

/* ---------- Toast ---------- */

interface ToastOptions {
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. Default 4000. */
  durationMs?: number;
  action?: { label: string; run: () => void };
}

interface ToastEntry extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((entry) => entry.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, message, ...options }]);
      const durationMs = options?.durationMs ?? 4000;
      if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((entry) => (
          <div key={entry.id} className="toast">
            <span className="toast__message">{entry.message}</span>
            {entry.action ? (
              <Button
                variant="primary"
                onClick={() => {
                  entry.action?.run();
                  dismiss(entry.id);
                }}
              >
                {entry.action.label}
              </Button>
            ) : null}
            <IconButton label={t('dismiss')} onClick={() => dismiss(entry.id)}>
              <Icon name="close" />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/* ---------- Slider ---------- */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  const id = useId();
  return (
    <div className="field">
      <div className="field__row">
        <label htmlFor={id}>{label}</label>
        <span className="field__value tabular">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/* ---------- Toggle ---------- */

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Keep the label for screen readers only, when a visible label sits next to the switch. */
  hideLabel?: boolean;
}

export function Toggle({ label, checked, onChange, hideLabel = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      {hideLabel ? <span className="visually-hidden">{label}</span> : label}
    </button>
  );
}
