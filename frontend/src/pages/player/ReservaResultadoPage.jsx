import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Loader2, CalendarCheck, Search } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { paymentService } from '../../services/paymentService';

/**
 * Página de retorno de MercadoPago (/reserva/exito | /reserva/error | /reserva/pendiente).
 *
 * NO confía en los query params de MP: si hay payment_id, consulta al backend
 * (paymentService.sync) que a su vez consulta a MP con el token → estado real.
 *
 * @param {'exito'|'error'|'pendiente'} variant  estado inicial por la ruta
 */
const CONFIG = {
  confirmado: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100',
    titulo: '¡Pago confirmado!', msg: 'Tu turno quedó reservado. Te esperamos en la cancha.' },
  pendiente:  { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100',
    titulo: 'Pago pendiente', msg: 'Estamos esperando la confirmación de MercadoPago. Te avisaremos cuando se acredite.' },
  error:      { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100',
    titulo: 'El pago no se completó', msg: 'No pudimos confirmar el pago y el turno fue liberado. Podés intentar de nuevo.' },
};

// Mapea el estado real de la reserva a una vista
function estadoToVista(estado) {
  if (estado === 'confirmado') return 'confirmado';
  if (estado === 'pendiente_pago' || estado === 'pendiente') return 'pendiente';
  if (estado === 'rechazado' || estado === 'cancelado') return 'error';
  return null;
}

export default function ReservaResultadoPage({ variant = 'pendiente' }) {
  const [params] = useSearchParams();
  const paymentId = params.get('payment_id') || params.get('collection_id');
  const reservaId = params.get('reserva_id') || params.get('external_reference');

  // Vista inicial según la ruta; se sobrescribe con el estado real del sync
  const initialVista = variant === 'exito' ? 'confirmado' : variant === 'error' ? 'error' : 'pendiente';
  const [vista,   setVista]   = useState(initialVista);
  const [loading, setLoading] = useState(!!paymentId);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    paymentService.sync(paymentId, reservaId)
      .then(res => {
        if (!alive) return;
        const v = estadoToVista(res?.estado);
        if (v) setVista(v);
      })
      .catch(() => {/* dejamos la vista inicial de la ruta */})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [paymentId, reservaId]);

  const cfg  = CONFIG[vista];
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center" data-aos="zoom-in">
          {loading ? (
            <div className="py-16">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">Confirmando el pago con MercadoPago…</p>
            </div>
          ) : (
            <div className="card">
              <div className={`w-16 h-16 rounded-full ${cfg.bg} flex items-center justify-center mx-auto mb-4`}>
                <Icon className={`w-8 h-8 ${cfg.color}`} />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">{cfg.titulo}</h1>
              <p className="text-muted-foreground text-sm mb-6">{cfg.msg}</p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/mis-turnos" className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
                  <CalendarCheck className="w-4 h-4" /> Ver mis turnos
                </Link>
                <Link to="/canchas" className="btn-outline flex-1 py-2.5 flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" /> Buscar canchas
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
