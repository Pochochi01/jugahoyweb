import { Link } from 'react-router-dom';
import { CalendarCheck, CreditCard, MessageCircle } from 'lucide-react';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import imgCancha from '../assets/carousel/Copilot_20260528_120016.png';

/** Ícono oficial de Google (multicolor, sin depender del tema). */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.4 30.3 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.9 6.1C12.5 13.2 17.8 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/>
      <path fill="#FBBC05" d="M10.6 28.5a14.6 14.6 0 0 1 0-9l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.2z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.5-5.8c-2.1 1.4-4.8 2.2-8 2.2-6.2 0-11.5-3.7-13.4-9.2l-7.9 6.2C6.7 42.6 14.7 48 24 48z"/>
    </svg>
  );
}

/** Separador "o …" entre métodos de acceso. */
export function Divider({ children }) {
  return (
    <div className="flex items-center gap-3 my-5" role="separator">
      <span className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground">{children}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

const PUNTOS = [
  { Icon: CalendarCheck, texto: 'Turnos libres en tiempo real, cancha por cancha.' },
  { Icon: CreditCard,    texto: 'Pagá la seña online o abonás en el complejo.' },
  { Icon: MessageCircle, texto: 'Recordatorios y avisos por WhatsApp.' },
];

/**
 * Layout de login / registro / recuperación.
 * Escritorio (lg+): foto de cancha con el mensaje del producto a la izquierda,
 * formulario a la derecha. Celular: solo el formulario, con el logo arriba.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-[100dvh] bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca (solo escritorio) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 xl:p-14 text-white">
        <img src={imgCancha} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(4_8_16/0.55)_0%,rgb(4_8_16/0.35)_40%,rgb(4_8_16/0.88)_100%)]" />
        <Link to="/" className="relative self-start rounded-lg" aria-label="JugaHoy — inicio">
          <BrandLogo emblem="h-12" text="text-3xl" onDark />
        </Link>
        <div className="relative max-w-md">
          <p className="text-4xl xl:text-5xl font-extrabold leading-[1.05] tracking-[-0.03em] text-balance">
            Tu cancha, a un toque.
          </p>
          <ul className="mt-8 space-y-3.5">
            {PUNTOS.map(({ Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-[15px] text-white/[0.88]">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/[0.12] ring-1 ring-white/[0.18] shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Formulario */}
      <main className="relative flex min-h-[100dvh] flex-col px-5 sm:px-8">
        <div className="flex items-center justify-between pt-5 sm:pt-6">
          <Link to="/" className="lg:invisible rounded-lg" aria-label="JugaHoy — inicio">
            <BrandLogo emblem="h-10" text="text-2xl" />
          </Link>
          <ThemeToggle compact />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] animate-fade-in">
            <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-[-0.025em]">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-7 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
