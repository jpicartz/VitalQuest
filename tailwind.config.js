const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Vitals semantic tokens (auto-swap light/dark via CSS vars) ──
        page: withAlpha('--surface-page'),
        card: withAlpha('--surface-card'),
        raised: withAlpha('--surface-raised'),
        fg: {
          DEFAULT: withAlpha('--fg'),
          soft: withAlpha('--fg-soft'),
          mute: withAlpha('--fg-mute'),
        },
        edge: withAlpha('--edge'),
        nutri: {
          DEFAULT: withAlpha('--nutri'),
          // Use for any surface that carries white text — see index.css.
          strong: withAlpha('--nutri-strong'),
        },
        hydro: {
          DEFAULT: withAlpha('--hydro'),
          strong: withAlpha('--hydro-strong'),
        },
        spark: withAlpha('--spark'),
        protein: withAlpha('--macro-protein'),
        carbs: withAlpha('--macro-carbs'),
        fat: withAlpha('--macro-fat'),
        track: withAlpha('--track'),

        // ── Legacy palette (ported from the old CDN config; kept so
        //    not-yet-restyled components still render during the migration) ──
        brand: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
          400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
          800: '#166534', 900: '#14532d',
        },
        accent: { 500: '#3b82f6', 600: '#2563eb' },
        alert: { 500: '#ef4444' },
      },
      borderRadius: {
        control: '10px',
        tile: '14px',
        card: '16px',
        modal: '20px',
      },
      boxShadow: {
        // Theme-aware elevation — see index.css. `shadow-e1` is correct in both
        // themes, which `shadow-sm dark:shadow-none` never was.
        e1: 'var(--elev-1)',
        e2: 'var(--elev-2)',
        e3: 'var(--elev-3)',
      },
      spacing: {
        tight: 'var(--space-tight)',
        group: 'var(--space-group)',
        section: 'var(--space-section)',
      },
      fontFamily: {
        // Must match the body rule in index.css. Previously this said 'Inter',
        // which is no longer loaded, so `font-sans` silently overrode the real
        // body font with a system fallback.
        sans: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        display: ['Familjen Grotesk', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'bounce-slow': 'bounce 3s infinite',
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
