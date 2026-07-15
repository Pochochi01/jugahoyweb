import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function Footer() {
  return (
    <footer style={{ background: '#050810', borderTop: '1px solid #1e2a3d' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-2 md:col-span-1">
            <Link to="/" className="inline-block mb-4" aria-label="JugaHoy — inicio">
              <BrandLogo emblem="h-11" text="text-2xl" tagline tagClass="text-[0.5rem] mt-1" />
            </Link>
            <p className="text-sm text-white/35 leading-relaxed max-w-xs">
              La plataforma integral para gestión y reserva de complejos deportivos en Argentina.
            </p>
          </div>

          {/* Plataforma */}
          <div>
            <h4 className="text-white/80 font-semibold text-sm mb-4">Plataforma</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/canchas"          className="text-white/35 hover:text-white transition-colors">Reservar cancha</Link></li>
              <li><Link to="/adherir-complejo" className="text-white/35 hover:text-white transition-colors">Adherí tu complejo</Link></li>
              <li><Link to="/profesores"       className="text-white/35 hover:text-white transition-colors">Profesores</Link></li>
            </ul>
          </div>

          {/* Cuenta */}
          <div>
            <h4 className="text-white/80 font-semibold text-sm mb-4">Cuenta</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/login"     className="text-white/35 hover:text-white transition-colors">Iniciar sesión</Link></li>
              <li><Link to="/registro"  className="text-white/35 hover:text-white transition-colors">Registrarse</Link></li>
              <li><Link to="/dashboard" className="text-white/35 hover:text-white transition-colors">Dashboard</Link></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="text-white/80 font-semibold text-sm mb-4">Contacto</h4>
            <ul className="space-y-2.5 text-sm text-white/35">
              <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0" /> hola@jugahoy.com.ar</li>
              <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0" /> +54 11 0000-0000</li>
              <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 shrink-0" /> Buenos Aires, Argentina</li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: '1px solid #1e2a3d' }}>
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} JugaHoy. Todos los derechos reservados.
          </p>
          <div className="flex gap-4">
            <Link to="/contacto" className="text-xs text-white/20 hover:text-white/50 transition-colors">Contacto</Link>
            <Link to="/politica-privacidad" className="text-xs text-white/20 hover:text-white/50 transition-colors">Política de privacidad</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
