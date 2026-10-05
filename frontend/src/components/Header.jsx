import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, X, LogOut, LayoutDashboard, CalendarCheck, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import NotificationBell from './NotificationBell';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };
  const isPlayer       = user?.rol === 'player';
  const isGeneralAdmin = user?.rol === 'general_admin';

  // Menú del jugador:
  //  - "Mi agenda" → acceso directo al complejo en el que está logueado
  //    (default_complex_id). Solo aparece si tiene un complejo asociado.
  //  - "Buscar canchas" → búsqueda por provincia/localidad.
  //  - Profesores y Contacto se mantienen como están.
  const playerLinks = [
    ...(user?.default_complex_id
      ? [{ to: `/canchas/${user.default_complex_id}`, label: 'Mi agenda' }]
      : []),
    { to: '/canchas',    label: 'Buscar canchas' },
    { to: '/profesores', label: 'Profesores' },
    { to: '/contacto',   label: 'Contacto' },
  ];

  // Menú para visitantes / admins (comportamiento original)
  const guestLinks = [
    { to: '/canchas',          label: 'Reservar cancha' },
    { to: '/profesores',       label: 'Profesores' },
    { to: '/adherir-complejo', label: 'Adherí tu complejo' },
    { to: '/contacto',         label: 'Contacto' },
  ];

  const navLinks = isPlayer ? playerLinks : guestLinks;

  return (
    <header className="sticky top-0 z-50 glass !border-x-0 !border-t-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[4.5rem]">

          {/* Logo */}
          <Link to="/" className="flex items-center" aria-label="JugaHoy — inicio">
            <BrandLogo emblem="h-10 sm:h-12" text="text-2xl sm:text-[1.75rem]" />
          </Link>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Principal">
            {navLinks.map(l => (
              <Link
                key={l.to} to={l.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-160"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Acciones desktop */}
          <div className="hidden md:flex items-center gap-1">
            {user ? (
              <>
                <NotificationBell />
                <ThemeToggle compact />
                <div className="h-5 w-px mx-2 bg-border" aria-hidden="true" />

                {isPlayer ? (
                  <Link to="/mis-turnos" className="btn-ghost !text-primary">
                    <CalendarCheck className="w-4 h-4" /> Mis turnos
                  </Link>
                ) : (
                  <>
                    {isGeneralAdmin && (
                      <Link to="/admin" className="btn-ghost !text-info">
                        <ShieldCheck className="w-4 h-4" /> Admin
                      </Link>
                    )}
                    <Link to="/dashboard" className="btn-ghost !text-primary">
                      <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Panel
                    </Link>
                  </>
                )}

                <button onClick={handleLogout} className="btn-icon hover:!text-danger hover:!bg-danger/10" aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut className="w-[18px] h-[18px]" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <ThemeToggle compact />
                <Link to="/login" className="btn-ghost">Entrar</Link>
                <Link to="/registro" className="btn-primary">Crear cuenta</Link>
              </div>
            )}
          </div>

          {/* Hamburguesa mobile */}
          <button
            className="btn-icon md:hidden -mr-2"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-1 animate-fade-in">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)}
              className="block px-3 py-3 rounded-lg text-[15px] font-medium text-foreground hover:bg-muted transition-colors duration-160">
              {l.label}
            </Link>
          ))}

          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="pt-3 mt-2 border-t border-border space-y-1">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <NotificationBell />
                  <span className="text-sm text-muted-foreground">Notificaciones</span>
                </div>
                {isPlayer ? (
                  <Link to="/mis-turnos" onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
                    Mis turnos
                  </Link>
                ) : (
                  <>
                    {isGeneralAdmin && (
                      <Link to="/admin" onClick={() => setMobileOpen(false)}
                        className="block px-3 py-3 rounded-lg text-sm font-medium text-info hover:bg-info/10 transition-colors duration-160">
                        Panel de administración
                      </Link>
                    )}
                    <Link to="/dashboard" onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
                      Panel del complejo
                    </Link>
                  </>
                )}
                <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                  className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-colors duration-160">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <div className="space-y-2 pt-1">
                <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-outline w-full">Entrar</Link>
                <Link to="/registro" onClick={() => setMobileOpen(false)} className="btn-primary w-full">Crear cuenta</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
