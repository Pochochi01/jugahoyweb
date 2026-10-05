/** @type {import('tailwindcss').Config} */
/*
 * Sistema de diseño JugaHoy — los colores salen de variables CSS (src/index.css)
 * con dos temas: oscuro (por defecto) y claro, vía <html data-theme="…">.
 * Cada token guarda canales RGB ("34 197 94") para que funcionen los
 * modificadores de opacidad de Tailwind: bg-primary/10, border-danger/30, etc.
 * Ver DESIGN.md en la raíz del repo antes de agregar colores nuevos.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca: verde de acción. DEFAULT = relleno de botones / indicadores;
        // en tema claro es un verde más profundo para que el texto en verde
        // (links, íconos) pase contraste AA sobre blanco.
        primary: {
          DEFAULT: token('primary'),
          foreground: token('primary-foreground'),
          600: token('primary-hover'),
          soft: token('primary-soft'),
        },
        // Azul del logo: segundo color de marca (CTA secundarios, info)
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        accent:    { DEFAULT: token('warning'), foreground: token('warning-foreground') },

        // Superficies (de atrás hacia adelante)
        background: token('background'),       // lienzo de la app
        subtle:     token('subtle'),           // 2.º neutro: sidebar, barras, filas alternas
        card: { DEFAULT: token('card'), foreground: token('foreground') },
        elevated:   token('elevated'),         // modales, popovers, menús
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        foreground: token('foreground'),
        border:     token('border'),
        input:      token('input'),
        ring:       token('ring'),

        // Estados semánticos (texto legible en cada tema; fondos suaves con /10–/15)
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        danger:  { DEFAULT: token('danger'),  foreground: token('danger-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        info:    { DEFAULT: token('info'),    foreground: token('info-foreground') },
        violet:  { DEFAULT: token('violet') },   // clases de profesor (se suma a la paleta violet-*)
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        brand: ['Poppins', 'system-ui', 'sans-serif'],   // solo el wordmark "JugaHoy"
      },
      // Escala de producto (ratio ~1.2, rem fijos). Interlineado por rol.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px — metadatos mínimos
        xs:    ['0.75rem',   { lineHeight: '1.1rem' }],    // 12px
        sm:    ['0.875rem',  { lineHeight: '1.35rem' }],   // 14px — controles, tablas
        base:  ['1rem',      { lineHeight: '1.6rem' }],    // 16px — cuerpo
        lg:    ['1.125rem',  { lineHeight: '1.65rem' }],
        xl:    ['1.25rem',   { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem',    { lineHeight: '2rem',    letterSpacing: '-0.015em' }],
        '3xl': ['1.875rem',  { lineHeight: '2.3rem',  letterSpacing: '-0.02em' }],
        '4xl': ['2.25rem',   { lineHeight: '2.6rem',  letterSpacing: '-0.025em' }],
        '5xl': ['3rem',      { lineHeight: '1.08',    letterSpacing: '-0.03em' }],
        '6xl': ['3.75rem',   { lineHeight: '1.04',    letterSpacing: '-0.035em' }],
        '7xl': ['4.5rem',    { lineHeight: '1',       letterSpacing: '-0.04em' }],
      },
      // Una sola escala de radios: controles 10px, tarjetas 16px, chips/pills full.
      borderRadius: { sm: '0.375rem', md: '0.5rem', lg: '0.625rem', xl: '0.875rem', '2xl': '1rem' },
      boxShadow: {
        // Sombras con desplazamiento y desenfoque, teñidas por tema (--shadow)
        sm:   '0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 1px rgb(var(--shadow) / 0.04)',
        card: '0 1px 2px rgb(var(--shadow) / 0.08), 0 8px 24px -12px rgb(var(--shadow) / 0.18)',
        pop:  '0 4px 12px -2px rgb(var(--shadow) / 0.16), 0 24px 48px -16px rgb(var(--shadow) / 0.32)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',          // UI: entra rápido, frena suave
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',     // movimiento en pantalla
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',        // paneles / sheets
      },
      transitionDuration: { 160: '160ms', 200: '200ms', 250: '250ms' },
      animation: {
        'fade-in': 'fadeIn 0.25s cubic-bezier(0.23, 1, 0.32, 1)',
        'pop-in': 'popIn 0.2s cubic-bezier(0.23, 1, 0.32, 1)',
        'sheet-in': 'sheetIn 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'drawer-in': 'drawerIn 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        shimmer: 'shimmer 1.4s linear infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        popIn:   { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        drawerIn: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        sheetIn: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
