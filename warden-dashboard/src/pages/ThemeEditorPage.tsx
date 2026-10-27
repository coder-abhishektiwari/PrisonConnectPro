import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** Shape of public/theme-engine.js — the single runtime theme source. */
interface ThemeEngine {
  DEFAULTS: Record<string, string | number>;
  FONTS: Record<string, string>;
  load: () => Record<string, string | number>;
  save: (cfg: Record<string, string | number>) => void;
  clear: () => void;
  apply: (cfg: Record<string, string | number>, doc?: Document) => unknown;
  applySaved: (doc?: Document) => boolean;
  strip: (base: string) => string[];
  buildVars: (cfg: Record<string, string | number>) => string;
}

type ThemeConfig = Record<string, string | number>;

const engine = (): ThemeEngine | undefined =>
  (window as unknown as { PCTheme?: ThemeEngine }).PCTheme;

function loadEngine(): Promise<void> {
  return new Promise((resolve) => {
    if (engine()) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = '/theme-engine.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

function ColorField({
  label,
  value,
  onChange,
  strip: showStrip,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  strip?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-12 font-medium text-neutral-500">{label}</span>
      <div className="mt-1.5 flex items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-0.5"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.toLowerCase();
            if (/^#[0-9a-f]{6}$/.test(v)) onChange(v);
          }}
          className="w-[92px] rounded-lg border border-line bg-canvas px-2 py-1.5 text-13 text-neutral-800 outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10"
        />
      </div>
      {showStrip && (
        <div className="mt-2 flex h-5 overflow-hidden rounded-md">
          {engine()
            ?.strip(value)
            .map((hex, i) => (
              <span key={i} className="flex-1" style={{ background: hex }} />
            ))}
        </div>
      )}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line/60 bg-white p-5 shadow-card">
      <h2 className="text-15 font-semibold text-neutral-900">{title}</h2>
      {hint && <p className="mt-0.5 text-13 text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-13 font-medium text-neutral-700">{label}</span>
        <span className="rounded-md bg-canvas px-2 py-0.5 text-12 font-medium text-neutral-600">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary-600"
      />
    </label>
  );
}

/**
 * Theme Studio — visual theme editor (no code needed).
 * Every change applies live (CSS variables) and auto-saves to localStorage;
 * the app reads the same saved theme on every start.
 */
export function ThemeEditorPage() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<ThemeConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadEngine().then(() => {
      if (!alive) return;
      setCfg(engine()?.load() ?? {});
    });
    return () => {
      alive = false;
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Live-apply on every change + debounce-save so it survives restarts.
  useEffect(() => {
    if (!cfg) return;
    const t = window.setTimeout(() => {
      const e = engine();
      if (!e) return;
      e.apply(cfg, document);
      e.save(cfg);
      showToast('Theme saved — it applies instantly and persists.');
    }, 400);
    return () => window.clearTimeout(t);
  }, [cfg, showToast]);

  const update = (patch: ThemeConfig) => setCfg((prev) => ({ ...(prev ?? {}), ...patch }));

  const reset = () => {
    const e = engine();
    if (!e) return;
    e.clear();
    const defaults = { ...e.DEFAULTS };
    setCfg(defaults);
    e.apply(defaults, document);
    showToast('Reset to the default PrisonConnect theme.');
  };

  const exportCss = () => {
    const e = engine();
    if (!e || !cfg) return;
    const css = `/* PrisonConnect theme export — paste over src/styles/theme.css :root or keep for reference */\n${e.buildVars(cfg)}\n`;
    const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prisonconnect-theme.css';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Theme CSS downloaded.');
  };

  if (!cfg) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-canvas">
        <p className="text-14 text-muted">Loading theme studio…</p>
      </div>
    );
  }

  const c = (key: string) => String(cfg[key] ?? '');
  const n = (key: string) => Number(cfg[key] ?? 1);
  const roundness = n('roundness');

  return (
    <div className="min-h-[100svh] bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-ink">
              <img src="/ic_icon.webp" alt="" className="h-5 w-5 object-contain" />
            </div>
            <div>
              <h1 className="text-15 font-semibold text-neutral-900">Theme Studio</h1>
              <p className="text-11 uppercase tracking-[0.16em] text-muted">PrisonConnect design settings</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={exportCss}
              className="hidden h-9 items-center rounded-full border border-line px-4 text-13 font-semibold text-neutral-700 transition-colors hover:bg-canvas sm:inline-flex"
            >
              Export CSS
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex h-9 items-center rounded-full bg-primary-600 px-4 text-13 font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Back to app
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Controls */}
        <div className="space-y-5">
          <Section title="Brand color" hint="Used for buttons, links, accents — shades generate automatically.">
            <ColorField label="Primary" value={c('primary')} onChange={(v) => update({ primary: v })} strip />
          </Section>

          <Section title="Status colors" hint="Success, error, warning and info feedback colors.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ColorField label="Success" value={c('success')} onChange={(v) => update({ success: v })} strip />
              <ColorField label="Error" value={c('error')} onChange={(v) => update({ error: v })} strip />
              <ColorField label="Warning" value={c('warning')} onChange={(v) => update({ warning: v })} strip />
              <ColorField label="Info" value={c('info')} onChange={(v) => update({ info: v })} strip />
            </div>
          </Section>

          <Section title="Base colors" hint="Page background, cards, borders and secondary text.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ColorField label="Page background" value={c('canvas')} onChange={(v) => update({ canvas: v })} />
              <ColorField label="Surface / cards" value={c('surface')} onChange={(v) => update({ surface: v })} />
              <ColorField label="Borders" value={c('line')} onChange={(v) => update({ line: v })} />
              <ColorField label="Muted text" value={c('muted')} onChange={(v) => update({ muted: v })} />
              <ColorField label="Dark panel" value={c('ink')} onChange={(v) => update({ ink: v })} />
            </div>
          </Section>

          <Section title="Type & shape" hint="Global size and roundness — every screen follows these.">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Slider
                label="Text size"
                value={n('textScale')}
                min={0.8}
                max={1.4}
                step={0.02}
                display={`${Math.round(n('textScale') * 100)}%`}
                onChange={(v) => update({ textScale: v })}
              />
              <Slider
                label="Corner roundness"
                value={roundness}
                min={0}
                max={2}
                step={0.05}
                display={roundness === 0 ? 'Square' : `${Math.round(roundness * 100)}%`}
                onChange={(v) => update({ roundness: v })}
              />
            </div>
            <label className="mt-5 block">
              <span className="text-13 font-medium text-neutral-700">Font</span>
              <select
                value={c('font') || 'system'}
                onChange={(e) => update({ font: e.target.value })}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-14 text-neutral-800 outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10"
              >
                <option value="system">System default</option>
                <option value="segoe">Segoe UI</option>
                <option value="georgia">Georgia (serif)</option>
                <option value="verdana">Verdana</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
          </Section>

          <div className="flex items-center justify-between rounded-card border border-dashed border-line bg-white px-5 py-4">
            <p className="text-13 text-muted">
              Changes save automatically. Reset anytime — nothing breaks.
            </p>
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-full border border-error-300 px-4 text-13 font-semibold text-error-600 transition-colors hover:bg-error-50"
            >
              Reset defaults
            </button>
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <div className="rounded-card border border-line/60 bg-white p-5 shadow-card">
            <p className="text-11 font-semibold uppercase tracking-[0.16em] text-muted">Live preview</p>

            <div className="mt-4 rounded-xl border border-line/60 bg-canvas p-4">
              <h3 className="text-26 font-semibold text-neutral-900">Welcome back</h3>
              <p className="mt-1 text-14 text-muted">Sign in to the monitoring dashboard</p>
              <div className="mt-3 h-11 rounded-2xl border border-line bg-white px-3.5 pt-3.5 text-14 text-neutral-400">
                Email Address
              </div>
              <button
                type="button"
                className="mt-3 h-11 w-full rounded-full bg-primary-600 text-14 font-semibold text-white shadow-btn transition-colors hover:bg-primary-700"
              >
                Sign In
              </button>
              <button
                type="button"
                className="mt-2 h-11 w-full rounded-full border border-primary-600 text-14 font-semibold text-primary-600"
              >
                Request access
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-success-100 px-2.5 py-1 text-12 font-medium text-success-700">Approved</span>
              <span className="rounded-full bg-error-100 px-2.5 py-1 text-12 font-medium text-error-700">Rejected</span>
              <span className="rounded-full bg-warning-100 px-2.5 py-1 text-12 font-medium text-warning-700">Pending</span>
              <span className="rounded-full bg-info-100 px-2.5 py-1 text-12 font-medium text-info-700">Info</span>
            </div>

            <div className="mt-4 rounded-xl bg-ink px-4 py-3 text-13 text-white">
              Dark panel sample — sidebar &amp; branding.
            </div>

            <div className="mt-4 space-y-2">
              {['primary', 'success', 'error', 'warning', 'info'].map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-14 text-11 uppercase text-muted">{name}</span>
                  <span className="flex h-4 flex-1 overflow-hidden rounded">
                    {engine()
                      ?.strip(c(name))
                      .map((hex, i) => (
                        <span key={i} className="flex-1" style={{ background: hex }} />
                      ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-card border border-line/60 bg-white p-4 shadow-card">
            <p className="text-13 text-muted">
              Same theme runs on <span className="font-medium text-neutral-700">Welcome, Login, Register, Dashboard</span> and
              every page inside — including the desktop app on next start.
            </p>
          </div>
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-13 font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
