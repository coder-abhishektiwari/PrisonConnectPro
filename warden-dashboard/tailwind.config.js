/**
 * Tailwind maps onto the GLOBAL THEME FILE (src/styles/theme.css).
 * Every value below reads a CSS variable — change theme.css (or the
 * in-app Theme Editor at /theme-editor) and the whole app re-themes.
 */

/** RGB triplet var + Tailwind <alpha-value> support: rgb(var(--x) / .5) */
const color = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** Full 50..900 palette from vars --<name>-50 … --<name>-900 */
const scale = (name) => ({
  50: color(`${name}-50`),
  100: color(`${name}-100`),
  200: color(`${name}-200`),
  300: color(`${name}-300`),
  400: color(`${name}-400`),
  500: color(`${name}-500`),
  600: color(`${name}-600`),
  700: color(`${name}-700`),
  800: color(`${name}-800`),
  900: color(`${name}-900`),
});

/** Status colors also expose a DEFAULT (e.g. bg-success) = their 600. */
const status = (name) => ({ DEFAULT: color(`${name}-600`), ...scale(name) });

/** text-N sizes from --text-N (each already = Npx * --text-scale). */
const size = (n) => [`var(--text-${n})`];

/** Standard scale with Tailwind's exact default line-heights. */
const std = (token, lineHeight, letterSpacing) => [
  `var(--text-${token})`,
  { lineHeight, ...(letterSpacing ? { letterSpacing } : {}) },
];

/** rounded-* from radius vars (each already = base * --roundness). */
const radius = (token) => `var(--radius-${token})`;

/** shadow-* from shadow vars. */
const shadow = (token) => `var(--shadow-${token})`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: scale('primary'),
        success: status('success'),
        error: status('error'),
        warning: status('warning'),
        info: status('info'),
        neutral: scale('neutral'),
        muted: color('muted'),
        line: color('line'),
        surface: color('surface'),
        canvas: color('canvas'),
        ink: color('ink'),
      },
      fontSize: {
        // pixel tokens (former text-[Npx] arbitraries)
        9: size(9),
        10: size(10),
        11: size(11),
        12: size(12),
        13: size(13),
        14: size(14),
        15: size(15),
        16: size(16),
        18: size(18),
        26: size(26),
        28: size(28),
        32: size(32),
        // standard scale (line-heights = Tailwind defaults)
        xs: std('xs', '1rem'),
        sm: std('sm', '1.25rem'),
        base: std('base', '1.5rem'),
        lg: std('lg', '1.75rem'),
        xl: std('xl', '1.75rem'),
        '2xl': std('2xl', '2rem'),
        '3xl': std('3xl', '2.25rem'),
        '4xl': std('4xl', '2.5rem'),
        '5xl': std('5xl', '1', '-0.02em'),
        '6xl': std('6xl', '1', '-0.025em'),
        '7xl': std('7xl', '1', '-0.03em'),
        '8xl': std('8xl', '1', '-0.035em'),
        '9xl': std('9xl', '1', '-0.04em'),
      },
      borderRadius: {
        DEFAULT: radius('default'),
        sm: radius('sm'),
        md: radius('md'),
        lg: radius('lg'),
        xl: radius('xl'),
        '2xl': radius('2xl'),
        '3xl': radius('3xl'),
        card: radius('card'), // 28px auth cards -> rounded-card
        full: radius('full'),
      },
      boxShadow: {
        DEFAULT: shadow('default'),
        sm: shadow('sm'),
        md: shadow('md'),
        lg: shadow('lg'),
        xl: shadow('xl'),
        '2xl': shadow('2xl'),
        card: shadow('card'),
        btn: shadow('btn'),
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};
