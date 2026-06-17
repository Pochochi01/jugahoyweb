import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, X, Dumbbell, LogOut, LayoutDashboard, CalendarCheck, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import NotificationBell from './NotificationBell';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };
  const isPlayer       = user?.rol === 'player';
  const isGeneralAdmin = user?.rol === 'general_admin';

  const navLinks = [
    { to: '/canchas',          label: 'Reservar cancha' },
    { to: '/profesores',       label: 'Profesores' },
    { to: '/adherir-complejo', label: 'Adherí tu complejo' },
    { to: '/contacto',         label: 'Contacto' },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'rgba(6,10,18,0.92)',
        borderColor: 'rgba(255,255,255,0.07)',
        WebkitBackdropFilter: 'blur(20px)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-black text-xl text-white">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-white" />
            </div>
            JugaHoy
          </Link>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map(l => (
              <Link
                key={l.to} to={l.to}
                className="text-sm font-medium text-white/55 hover:text-white transition-colors duration-200"
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
                <div className="h-5 w-px mx-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

                {isPlayer ? (
                  <Link to="/mis-turnos"
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 px-2 transition-colors">
                    <CalendarCheck className="w-4 h-4" /> Mis turnos
                  </Link>
                ) : (
                  <>
                    {isGeneralAdmin && (
                      <Link to="/admin"
                        className="flex items-center gap-1.5 text-sm font-medium text-purple-400 hover:text-purple-300 px-2 transition-colors">
                        <ShieldCheck className="w-4 h-4" /> Admin
                      </Link>
                    )}
                    <Link to="/dashboard"
                      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 px-2 transition-colors">
                      <LayoutDashboard className="w-4 h-4" /> Dashboard
                    </Link>
                  </>
                )}

                <button onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm text-white/40 hover:text-red-400 transition-colors px-2">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login"
                  className="text-sm font-medium text-white/60 hover:text-white transition-colors px-2">
                  Iniciar sesión
                </Link>
                <Link to="/registro"
                  className="btn-primary text-sm py-2 px-5 glow-green">
                  Registrarse
                </Link>
              </div>
            )}
          </div>

          {/* Hamburguesa mobile */}
          <button
            className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden border-t px-4 py-5 space-y-1"
          style={{ background: '#060a12', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              {l.label}
            </Link>
          ))}

          <div className="pt-3 mt-3 border-t space-y-1" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <NotificationBell />
                  <span className="text-sm text-white/40">Notificaciones</span>
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
                        className="block px-3 py-2.5 rounded-lg text-sm font-medium text-purple-400 hover:bg-purple-500/10 transition-colors">
                        Panel de administración
                      </Link>
                    )}
                    <Link to="/dashboard" onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
                      Dashboard
                    </Link>
                  </>
                )}
                <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                  className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <div className="space-y-2 pt-1">
                <Link to="/login" onClick={() => setMobileOpen(false)}
                  className="block text-center py-2.5 rounded-lg text-sm font-medium border border-border text-foreground hover:border-primary hover:text-primary transition-colors">
                  Iniciar sesión
                </Link>
                <Link to="/registro" onClick={() => setMobileOpen(false)}
                  className="block text-center btn-primary text-sm py-2.5">
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
