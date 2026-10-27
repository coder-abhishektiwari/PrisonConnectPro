/**
 * PrisonConnect theme engine.
 * Single runtime that turns a small theme config (brand color, status colors,
 * surfaces, text scale, roundness, font) into the CSS variables the whole app
 * is built on (see src/styles/theme.css). Loaded by:
 *   - the app at startup (src/main.tsx) — restores saved overrides
 *   - the Theme Editor (/theme-editor) — live preview + save
 * Works as a classic <script> and as a dynamic import (it only sets a global).
 */
(function (g) {
  'use strict';

  var STORAGE_KEY = 'pc_theme_v1';

  var DEFAULTS = {
    primary: '#4f46e5',
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
    info: '#0284c7',
    muted: '#8696a0',
    line: '#d1d7db',
    surface: '#e9eef3',
    canvas: '#fbfbfd',
    ink: '#060609',
    textScale: 1,
    roundness: 1,
    font: 'system',
  };

  var FONTS = {
    system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    segoe: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    georgia: "Georgia, 'Times New Roman', serif",
    verdana: "Verdana, Geneva, sans-serif",
    mono: "Consolas, 'Courier New', monospace",
  };

  // Groups get a full 50..900 scale derived from the picked base color.
  var GROUPS = ['primary', 'success', 'error', 'warning', 'info'];
  // Single-value tokens (semantic surfaces/text).
  var SOLIDS = ['muted', 'line', 'surface', 'canvas', 'ink'];

  // Shade recipe: t = how far to MIX toward white (50..500) or black (700..900).
  var SHADE_T = {
    50: 0.93, 100: 0.86, 200: 0.7, 300: 0.55, 400: 0.35, 500: 0.16,
    600: 0,
    700: 0.12, 800: 0.26, 900: 0.4,
  };

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return [79, 70, 229];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, gr, bl) {
    var parts = [r, gr, bl].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    });
    return '#' + parts.join('');
  }

  /** Mix hex color a toward hex color b by t (0..1). Returns hex. */
  function mix(a, b, t) {
    var ca = hexToRgb(a);
    var cb = hexToRgb(b);
    return rgbToHex(
      ca[0] + (cb[0] - ca[0]) * t,
      ca[1] + (cb[1] - ca[1]) * t,
      ca[2] + (cb[2] - ca[2]) * t
    );
  }

  /** Full 50..900 scale (hex) derived from the base (used as 600). */
  function shades(base) {
    var out = {};
    Object.keys(SHADE_T).forEach(function (k) {
      var t = SHADE_T[k];
      if (k === '600') out[k] = base;
      else if (t > 0) out[k] = mix(base, '#ffffff', t);
      else out[k] = mix(base, '#000000', -t);
    });
    return out;
  }

  /** Ordered strip [50..900] of hex colors — used for editor swatches. */
  function strip(base) {
    var s = shades(base);
    return [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(function (k) {
      return s[k];
    });
  }

  /** '#rrggbb' -> 'r g b' (the triplet form CSS vars use). */
  function tri(hex) {
    return hexToRgb(hex).join(' ');
  }

  /** Theme config -> ':root { ... }' CSS overriding the base theme file. */
  function buildVars(cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var lines = [];
    GROUPS.forEach(function (name) {
      var s = shades(cfg[name] || DEFAULTS[name]);
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].forEach(function (k) {
        lines.push('  --' + name + '-' + k + ': ' + tri(s[k]) + ';');
      });
    });
    SOLIDS.forEach(function (name) {
      lines.push('  --' + name + ': ' + tri(cfg[name] || DEFAULTS[name]) + ';');
    });
    lines.push('  --text-scale: ' + (Number(cfg.textScale) || 1) + ';');
    lines.push('  --roundness: ' + (Number(cfg.roundness) || 1) + ';');
    lines.push('  --font-sans: ' + (FONTS[cfg.font] || FONTS.system) + ';');
    return ':root {\n' + lines.join('\n') + '\n}';
  }

  /** Inject/refresh the override style tag. Returns the <style> element. */
  function apply(cfg, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    var el = doc.getElementById('pc-theme-vars');
    if (!el) {
      el = doc.createElement('style');
      el.id = 'pc-theme-vars';
      (doc.head || doc.documentElement).appendChild(el);
    }
    el.textContent = buildVars(cfg);
    return el;
  }

  function load() {
    var cfg = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) cfg = Object.assign(cfg, JSON.parse(raw));
    } catch (e) {
      /* corrupted/unavailable — keep defaults */
    }
    return cfg;
  }

  function save(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, DEFAULTS, cfg || {})));
    } catch (e) {
      /* storage full/blocked — preview still works in-session */
    }
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* noop */
    }
  }

  /**
   * Restore saved overrides at boot. Returns true only when a saved theme was
   * applied — with no saved theme the pristine theme.css defaults stay active.
   */
  function applySaved(doc) {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) return false;
    } catch (e) {
      return false;
    }
    return !!apply(load(), doc);
  }

  g.PCTheme = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULTS: DEFAULTS,
    FONTS: FONTS,
    hexToRgb: hexToRgb,
    mix: mix,
    shades: shades,
    strip: strip,
    tri: tri,
    buildVars: buildVars,
    apply: apply,
    load: load,
    save: save,
    clear: clear,
    applySaved: applySaved,
  };
})(typeof window !== 'undefined' ? window : globalThis);
