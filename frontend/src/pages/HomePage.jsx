import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Building2, Users, ChevronRight, ArrowRight, ChevronLeft } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { statsService } from '../services/statsService';

import imgPadel   from '../assets/carousel/Copilot_20260528_120008.png';
import imgFutbol  from '../assets/carousel/Copilot_20260528_120016.png';
import imgTenis   from '../assets/carousel/Copilot_20260528_120346.png';
import imgBasquet from '../assets/carousel/Copilot_20260528_120523.png';

const SLIDES = [
  { sport: 'Pádel',   label: 'Estrategia, velocidad y adrenalina',       img: imgPadel,   accent: '#3b82f6' },
  { sport: 'Fútbol',  label: 'El deporte más apasionante del mundo',      img: imgFutbol,  accent: '#22c55e' },
  { sport: 'Tenis',   label: 'Precisión y potencia en cada golpe',         img: imgTenis,   accent: '#f59e0b' },
  { sport: 'Básquet', label: 'Ritmo, equipo y emoción sin parar',          img: imgBasquet, accent: '#f97316' },
];

const SPORT_CARDS = [
  { sport: 'Fútbol',  img: imgFutbol,  desc: 'Campos de 5, 7 y 11 jugadores' },
  { sport: 'Pádel',   img: imgPadel,   desc: 'Canchas techadas y al aire libre' },
  { sport: 'Tenis',   img: imgTenis,   desc: 'Piso de tierra, cemento y sintético' },
  { sport: 'Básquet', img: imgBasquet, desc: 'Canchas cubiertas e iluminadas' },
];

export default function HomePage() {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [stats,   setStats]   = useState({ usuarios: 0, complejos: 0, turnos: 0 });

  // ── Autoplay sin closures stale ──────────────────────────────────────────
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setCurrent(c => (c + 1) % SLIDES.length);
    }, 5500);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    statsService.getGlobal().then(setStats).catch(() => {});
  }, []);

  const goTo = (i) => setCurrent(i);
  const prev = () => setCurrent(c => (c - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setCurrent(c => (c + 1) % SLIDES.length);

  const slide = SLIDES[current];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060a12' }}>
      <Header />

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ height: 'calc(100svh - 64px)', minHeight: 520 }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Stack de imágenes con crossfade */}
        {SLIDES.map((s, i) => (
          <img
            key={s.sport}
            src={s.img}
            alt={s.sport}
            fetchpriority={i === 0 ? 'high' : 'low'}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out select-none"
            style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
            draggable={false}
          />
        ))}

        {/* Overlay con gradiente en capas */}
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(6,10,18,0.90) 0%, rgba(6,10,18,0.45) 55%, rgba(6,10,18,0.15) 100%)' }} />
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, rgba(6,10,18,0.40) 0%, transparent 50%)' }} />

        {/* Contenido */}
        <div className="relative z-20 flex flex-col h-full">

          {/* Badge sport — top left */}
          <div className="flex-1 flex items-start px-6 sm:px-12 lg:px-20 pt-10 sm:pt-16">
            <div
              className="px-4 py-1 rounded-full text-xs font-bold tracking-[0.2em] uppercase transition-all duration-700"
              style={{ background: slide.accent + '20', border: `1px solid ${slide.accent}50`, color: slide.accent }}
            >
              {slide.sport}
            </div>
          </div>

          {/* Texto principal — bottom left */}
          <div className="px-6 sm:px-12 lg:px-20 pb-10 sm:pb-16">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-4 drop-shadow-2xl">
              Jugá hoy,<br />
              <span className="transition-colors duration-700" style={{ color: slide.accent }}>
                reservá ahora
              </span>
            </h1>

            <p className="text-sm sm:text-base text-white/60 mb-8 max-w-md font-light leading-relaxed">
              {slide.label}. La plataforma más completa para reservar canchas deportivas en Argentina.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/canchas"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm sm:text-base text-white transition-all duration-300 hover:scale-105 active:scale-95"
                style={{ background: slide.accent, boxShadow: `0 0 28px ${slide.accent}55` }}
              >
                Reservar cancha <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/adherir-complejo"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm sm:text-base text-white transition-all duration-300 hover:bg-white/10"
                style={{ border: '1px solid rgba(255,255,255,0.25)' }}
              >
                Adherí tu complejo
              </Link>
            </div>

            {/* Controles del carousel */}
            <div className="flex items-center gap-4 mt-10">
              <button onClick={prev}
                className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Anterior">
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex gap-2 items-center">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    aria-label={`Ir a slide ${i + 1}`}
                    className="rounded-full transition-all duration-500"
                    style={{
                      width:      i === current ? 28 : 8,
                      height:     8,
                      background: i === current ? slide.accent : 'rgba(255,255,255,0.3)',
                    }}
                  />
                ))}
              </div>

              <button onClick={next}
                className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Siguiente">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ STATS ═══════════════════════════════════════════════════════════ */}
      <section className="py-12 sm:py-16" style={{ background: '#0a0e1a', borderTop: '1px solid #1e2a3d', borderBottom: '1px solid #1e2a3d' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ background: '#1e2a3d' }}>
            {[
              { icon: Users,     label: 'Jugadores activos',   value: stats.usuarios.toLocaleString(), color: '#3b82f6' },
              { icon: Calendar,  label: 'Turnos concretados',  value: stats.turnos.toLocaleString(),   color: '#22c55e' },
              { icon: Building2, label: 'Complejos adheridos', value: stats.complejos.toLocaleString(), color: '#f59e0b' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex flex-col items-center justify-center py-10 px-6 text-center"
                style={{ background: '#0d1220' }} data-aos="fade-up">
                <Icon style={{ color }} className="w-6 h-6 mb-3 opacity-80" />
                <div className="text-3xl sm:text-4xl font-black mb-1 tabular-nums" style={{ color }}>
                  {value || '—'}
                </div>
                <div className="text-xs sm:text-sm text-white/35 tracking-wide">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DEPORTES ════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24" style={{ background: '#060a12' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-10 sm:mb-14" data-aos="fade-up">
            <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-3">Canchas disponibles</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white">Elegí tu deporte</h2>
            <p className="text-white/40 mt-3 max-w-md mx-auto text-sm sm:text-base">
              Encontrá el complejo ideal cerca tuyo y reservá en segundos
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {SPORT_CARDS.map((card, i) => (
              <Link
                key={card.sport}
                to="/canchas"
                data-aos="fade-up"
                data-aos-delay={i * 70}
                className="group relative overflow-hidden rounded-xl sm:rounded-2xl block"
                style={{ aspectRatio: '3/4' }}
              >
                <img
                  src={card.img}
                  alt={card.sport}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
                {/* overlay permanente */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                {/* overlay hover */}
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* texto */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                  <div className="text-base sm:text-xl font-black text-white mb-0.5 sm:mb-1">{card.sport}</div>
                  <div className="text-xs text-white/50 hidden sm:block mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-75">
                    {card.desc}
                  </div>
                  <div className="flex items-center gap-1 text-primary text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                    Ver turnos <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ═════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-20 sm:py-28" style={{ background: '#0a0e1a', borderTop: '1px solid #1e2a3d' }} data-aos="fade-up">
        {/* Glow */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(34,197,94,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">Para administradores</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4 sm:mb-6">
            ¿Tenés un complejo deportivo?
          </h2>
          <p className="text-white/45 text-base sm:text-lg mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
            Sumarte es gratis. Gestioná tu agenda, caja, colaboradores y reservas online desde un solo panel.
          </p>
          <Link to="/adherir-complejo"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white font-bold px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 text-sm sm:text-base glow-green">
            Adherí tu complejo <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
