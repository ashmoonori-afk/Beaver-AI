// Tailwind config — Phase 4U design tokens.
//
// One accent (emerald) on a near-monochrome surface (slate). Type
// hierarchy is carried by weight + size, not color (per design
// principles). Motion durations centralize ease-out 200ms.

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // single vibrant accent
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981', // primary action / running / approve
          600: '#059669',
          700: '#047857',
        },
        // canvas + surfaces
        surface: {
          50: '#f8fafc',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        // text scale
        text: {
          50: '#f8fafc', // headlines on dark
          300: '#cbd5e1', // body
          500: '#64748b', // caption / meta
        },
        // single error ring (rose-500)
        danger: {
          400: '#fb7185',
          500: '#f43f5e',
        },
      },
      fontSize: {
        // type scale — weight + size carry hierarchy
        hero: ['1.6rem', { lineHeight: '1.2', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['0.875rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)', // ease-out
      },
      borderRadius: {
        card: '0.75rem',
      },
      fontFamily: {
        sans: ['Pretendard', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
