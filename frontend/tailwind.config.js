/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#22c55e',
          foreground: '#ffffff',
          50:  '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        secondary: { DEFAULT: '#3b82f6', foreground: '#ffffff' },
        accent:    { DEFAULT: '#f59e0b', foreground: '#ffffff' },
        // ── dark theme base ──
        background: '#060a12',
        foreground: '#e2e8f0',
        card: {
          DEFAULT:    '#0d1220',
          foreground: '#e2e8f0',
        },
        muted: {
          DEFAULT:    '#0d1220',
          foreground: '#94a3b8',
        },
        border: '#1e2a3d',
        input:  '#141b2d',
        ring:   '#22c55e',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { lg: '0.75rem', md: '0.5rem', sm: '0.25rem' },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
