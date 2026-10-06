import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Building2, Users, ChevronRight, ArrowRight, ChevronLeft, Clock, CheckCircle2, CreditCard, MessageCircle, Search } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SportIcon from '../components/SportIcon';
import { statsService } from '../services/statsService';

import imgPadel   from '../assets/carousel/Copilot_20260528_120008.png';
import imgFutbol  from '../assets/carousel/Copilot_20260528_120016.png';
import imgTenis   from '../assets/carousel/Copilot_20260528_120346.png';
import imgBasquet from '../assets/carousel/Copilot_20260528_120523.png';

const SLIDES = [
  { sport: 'Pádel',   key: 'padel',   label: 'Estrategia, velocidad y adrenalina',  img: imgPadel },
  { sport: 'Fútbol',  key: 'futbol',  label: 'El deporte más apasionante del mundo', img: imgFutbol },
  { sport: 'Tenis',   key: 'tenis',   label: 'Precisión y potencia en cada golpe',   img: imgTenis },
  { sport: 'Básquet', key: 'basquet', label: 'Ritmo, equipo y emoción sin parar',    img: imgBasquet },
];
const SPORT_CARDS = [
  { sport: 'Fútbol',  key: 'futbol',  img: imgFutbol,  desc: 'Canchas de 5, 7 y 11' },
  { sport: 'Pádel',   key: 'padel',   img: imgPadel,   desc: 'Techadas y al aire libre' },
  { sport: 'Tenis',   key: 'tenis',   img: imgTenis,   desc: 'Polvo, cemento y sintético' },
  { sport: 'Básquet', key: 'basquet', img: imgBasquet, desc: 'Cubiertas e iluminadas' },
];
const PASOS = [
  { Icon: Search,        titulo: 'Encontrá tu cancha', texto: 'Filtrá por ciudad y deporte, y mirá los turnos libres en tiempo real.' },
  { Icon: Clock,         titulo: 'Elegí el horario',   texto: 'Tocás la hora, elegís duración y listo. Sin llamados ni esperas.' },
  { Icon: CreditCard,    titulo: 'Pagá como quieras',  texto: 'Seña o total por MercadoPago, o abonás directamente en el complejo.' },
  { Icon: MessageCircle, titulo: 'Te avisamos',        texto: 'Confirmación y recordatorios por WhatsApp antes de jugar.' },
];

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const puntero = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Muestra hijos con una entrada suave al entrar en pantalla (una sola vez). */
function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (reduceMotion()) { setVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { threshold: 0.18 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={className}
      style={{ transitionDelay: `${delay}ms`, transitionProperty: 'opacity, transform, filter', transitionDuration: '700ms', transitionTimingFunction: 'cubic-bezier(0.23,1,0.32,1)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px) scale(0.98)', filter: visible ? 'none' : 'blur(6px)' }}>
      {children}
    </Tag>
  );
}

/** Número que cuenta hasta su valor cuando entra en pantalla. */
function CountUp({ value }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!value) return undefined;
    if (reduceMotion()) { setN(value); return undefined; }
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const paso = (t) => {
        const p = Math.min(1, (t - t0) / 1400);
        setN(Math.round(value * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    }, { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  return <span ref={ref} className="tabular">{value ? n.toLocaleString('es-AR') : '—'}</span>;
}

/** Tarjeta con inclinación 3D y reflejo que siguen al puntero (solo mouse). */
function Tilt({ children, className = '', max = 10, style }) {
  const ref = useRef(null);
  const raf = useRef(0);
  const mover = (e) => {
    if (!puntero() || reduceMotion()) return;
    const el = ref.current; const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateZ(0)`;
      el.style.setProperty('--gx', `${x * 100}%`); el.style.setProperty('--gy', `${y * 100}%`); el.style.setProperty('--go', '1');
    });
  };
  const salir = () => {
    cancelAnimationFrame(raf.current);
    const el = ref.current; if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0) rotateY(0)'; el.style.setProperty('--go', '0');
  };
  return (
    <div ref={ref} onPointerMove={mover} onPointerLeave={salir}
      className={`relative [transform-style:preserve-3d] transition-transform duration-300 ease-out will-change-transform ${className}`} style={style}>
      {children}
      {/* reflejo */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{ opacity: 'var(--go, 0)', background: 'radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgb(255 255 255 / 0.18), transparent 55%)', mixBlendMode: 'overlay' }} />
    </div>
  );
}

/** Tarjeta flotante de "reserva" en 3D para el hero: muestra el producto. */
function TarjetaReserva({ sport, sportKey }) {
  return (
    <div className="relative w-[300px] [transform-style:preserve-3d] animate-[flotar_6s_ease-in-out_infinite] motion-reduce:animate-none">
      <div className="rounded-2xl border border-white/15 bg-[rgb(10_15_27/0.78)] p-4 text-white shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[rgb(34_197_94/0.18)] text-[#4ade80]"><SportIcon deporte={sportKey} className="w-5 h-5" /></span>
          <div className="min-w-0">
            <div className="text-sm font-bold">Cancha 1 · {sport}</div>
            <div className="text-xs text-white/60">Hoy · elegí tu horario</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 [transform:translateZ(30px)]">
          {['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map((h, i) => (
            <span key={h} className={`rounded-lg py-1.5 text-center text-xs font-semibold tabular border ${i === 2 ? 'bg-[#22c55e] text-[#03200d] border-[#22c55e]' : i === 4 ? 'border-white/10 text-white/30 line-through' : 'border-white/15 text-white/85'}`}>{h}</span>
          ))}
        </div>
      </div>
      {/* confirmación que flota por delante */}
      <div className="absolute -right-6 -bottom-7 rounded-xl border border-white/15 bg-[rgb(10_15_27/0.9)] px-3 py-2 text-xs text-white shadow-[0_20px_40px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl [transform:translateZ(60px)] flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[#4ade80]" /> Reservado · 20:00 a 21:00
      </div>
    </div>
  );
}

export default function HomePage() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState({ usuarios: 0, complejos: 0, turnos: 0 });
  const heroRef = useRef(null);
  const capaRef = useRef(null);
  const tarjetaRef = useRef(null);

  useEffect(() => {
    if (paused || reduceMotion()) return undefined;
    const t = setInterval(() => setCurrent(c => (c + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => { statsService.getGlobal().then(setStats).catch(() => {}); }, []);

  // Parallax 3D del hero según el puntero (fondo y tarjeta en sentidos opuestos)
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !puntero() || reduceMotion()) return undefined;
    let raf = 0;
    const mover = (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (capaRef.current) capaRef.current.style.transform = `scale(1.08) translate3d(${x * -18}px, ${y * -12}px, 0)`;
        if (tarjetaRef.current) tarjetaRef.current.style.transform = `perspective(1000px) rotateY(${-14 + x * 16}deg) rotateX(${6 - y * 12}deg)`;
      });
    };
    hero.addEventListener('pointermove', mover);
    return () => { hero.removeEventListener('pointermove', mover); cancelAnimationFrame(raf); };
  }, []);

  const prev = () => setCurrent(c => (c - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setCurrent(c => (c + 1) % SLIDES.length);
  const slide = SLIDES[current];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <style>{`
        @keyframes flotar { 0%,100% { translate: 0 0 } 50% { translate: 0 -10px } }
        @keyframes kenburns { from { transform: scale(1.08) } to { transform: scale(1.16) } }
        @keyframes palabra { from { opacity: 0; transform: translateY(0.6em) rotateX(-70deg); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }
        .palabra { display: inline-block; transform-origin: 50% 100%; animation: palabra 0.9s cubic-bezier(0.23,1,0.32,1) both }
        @media (prefers-reduced-motion: reduce) { .palabra { animation: none } }
      `}</style>
      <Header />

      {/* ══ HERO ══ */}
      <section ref={heroRef} className="relative overflow-hidden isolate text-white"
        style={{ height: 'calc(100svh - 64px)', minHeight: 560 }}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div ref={capaRef} className="absolute inset-0 -z-10 transition-transform duration-500 ease-out" style={{ transform: 'scale(1.08)' }}>
          {SLIDES.map((s, i) => (
            <img key={s.sport} src={s.img} alt="" aria-hidden="true" draggable={false}
              fetchpriority={i === 0 ? 'high' : 'low'}
              className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-1000 ease-in-out motion-safe:animate-[kenburns_12s_ease-out_both]"
              style={{ opacity: i === current ? 1 : 0 }} />
          ))}
        </div>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(4_8_16/0.95)_0%,rgb(4_8_16/0.5)_50%,rgb(4_8_16/0.2)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgb(4_8_16/0.6)_0%,transparent_60%)]" />

        <div className="mx-auto flex h-full max-w-7xl items-end lg:items-center gap-10 px-6 sm:px-10 lg:px-12 pb-12 lg:pb-0">
          <div className="max-w-2xl">
            <div key={slide.key} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur animate-fade-in">
              <SportIcon deporte={slide.key} className="w-3.5 h-3.5 text-[#4ade80]" /> {slide.sport}
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.02] tracking-[-0.035em] [perspective:600px]">
              {['Jugá', 'hoy,'].map((w, i) => <span key={w} className="palabra mr-[0.25em]" style={{ animationDelay: `${i * 90}ms` }}>{w}</span>)}
              <br />
              {['reservá', 'ahora.'].map((w, i) => <span key={w} className="palabra mr-[0.25em] text-[#4ade80]" style={{ animationDelay: `${200 + i * 90}ms` }}>{w}</span>)}
            </h1>
            <p key={slide.label} className="mt-5 max-w-md text-base sm:text-lg text-white/75 animate-fade-in">
              {slide.label}. Turnos libres en tiempo real en los complejos de tu ciudad.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/canchas" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-7 py-3.5 font-bold text-[#03200d] shadow-[0_12px_30px_-10px_rgb(34_197_94/0.7)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-10px_rgb(34_197_94/0.8)] active:scale-[0.97]">
                Reservar cancha <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link to="/adherir-complejo" className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 font-bold backdrop-blur transition-colors duration-200 hover:bg-white/15">
                Adherí tu complejo
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-3">
              <button onClick={prev} aria-label="Imagen anterior" className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
              {SLIDES.map((s, i) => (
                <button key={s.key} onClick={() => setCurrent(i)} aria-label={`Ver ${s.sport}`} aria-pressed={i === current}
                  className="relative h-1.5 overflow-hidden rounded-full bg-white/25 transition-[width] duration-500 ease-out" style={{ width: i === current ? 40 : 14 }}>
                  {i === current && !paused && <span className="absolute inset-y-0 left-0 bg-white motion-safe:animate-[barra_6s_linear_both]" />}
                  {i === current && paused && <span className="absolute inset-0 bg-white" />}
                </button>
              ))}
              <button onClick={next} aria-label="Imagen siguiente" className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
              <style>{'@keyframes barra { from { width: 0 } to { width: 100% } }'}</style>
            </div>
          </div>
          <div className="ml-auto hidden lg:block [perspective:1000px]">
            <div ref={tarjetaRef} className="transition-transform duration-500 ease-out [transform-style:preserve-3d]" style={{ transform: 'perspective(1000px) rotateY(-14deg) rotateX(6deg)' }}>
              <TarjetaReserva sport={slide.sport} sportKey={slide.key} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ STATS ══ */}
      <section className="border-y border-border bg-subtle py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { Icon: Users, label: 'Jugadores activos', value: stats.usuarios, tone: 'info' },
            { Icon: Calendar, label: 'Turnos concretados', value: stats.turnos, tone: 'success' },
            { Icon: Building2, label: 'Complejos adheridos', value: stats.complejos, tone: 'warning' },
          ].map(({ Icon, label, value, tone }, i) => (
            <Reveal key={label} delay={i * 90}>
              <Tilt max={6} className="card flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl [transform:translateZ(30px)]" style={{ background: `rgb(var(--${tone}) / 0.14)`, color: `rgb(var(--${tone}))` }}>
                  <Icon className="w-6 h-6" />
                </span>
                <div className="[transform:translateZ(20px)]">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground"><CountUp value={value} /></div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ DEPORTES ══ */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10 sm:mb-14 max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Elegí tu deporte</h2>
            <p className="mt-3 text-muted-foreground">Encontrá el complejo ideal cerca tuyo y reservá en segundos.</p>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {SPORT_CARDS.map((c, i) => (
              <Reveal key={c.sport} delay={i * 80}>
                <Tilt max={12} className="rounded-2xl">
                  <Link to="/canchas" className="group relative block overflow-hidden rounded-2xl text-white shadow-card" style={{ aspectRatio: '3/4' }}>
                    <img src={c.img} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 [transform:translateZ(40px)]">
                      <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/20"><SportIcon deporte={c.key} className="w-5 h-5" /></span>
                      <div className="text-lg sm:text-2xl font-extrabold">{c.sport}</div>
                      <div className="text-xs sm:text-sm text-white/75">{c.desc}</div>
                      <div className="mt-2 flex items-center gap-1 text-sm font-semibold text-[#4ade80] transition-transform duration-200 group-hover:translate-x-1">
                        Ver turnos <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CÓMO FUNCIONA ══ */}
      <section className="border-t border-border bg-subtle py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="mb-10 max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Reservar te lleva un minuto</h2>
          </Reveal>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map(({ Icon, titulo, texto }, i) => (
              <Reveal as="li" key={titulo} delay={i * 100}>
                <Tilt max={8} className="card h-full p-5">
                  <div className="flex items-center justify-between [transform:translateZ(30px)]">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary"><Icon className="w-5 h-5" /></span>
                    <span className="text-sm font-bold text-muted-foreground tabular">{i + 1}/4</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold [transform:translateZ(20px)]">{titulo}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
                </Tilt>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">¿Tenés un complejo deportivo?</h2>
          <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg text-muted-foreground">
            Sumarte es gratis. Agenda, caja, colaboradores, torneos y reservas online desde un solo panel.
          </p>
          <Link to="/adherir-complejo" className="btn-primary btn-lg mt-8">
            Adherí tu complejo <ChevronRight className="w-5 h-5" />
          </Link>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
