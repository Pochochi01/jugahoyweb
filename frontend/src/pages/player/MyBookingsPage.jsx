import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, Clock, MapPin, Building2,
  CheckCircle, XCircle, AlertCircle, ChevronLeft,
} from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { publicService } from '../../services/publicService';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };
const METODO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'MercadoPago', tarjeta: 'Tarjeta' };

const FILTROS = [
  { key: 'proximos',   label: 'Próximos' },
  { key: 'pasados',    label: 'Pasados' },
  { key: 'cancelados', label: 'Cancelados' },
  { key: 'todos',      label: 'Todos' },
];

function isFuture(booking) {
  return new Date(`${booking.fecha}T${booking.hora_inicio}:00`) > new Date();
}

function StatusBadge({ estado, fecha, hora_inicio }) {
  const future = new Date(`${fecha}T${hora_inicio}:00`) > new Date();
  if (estado === 'cancelado' || estado === 'rechazado') return (
    <span className="flex items-center gap-1 badge-red">
      <XCircle className="w-3 h-3" /> {estado === 'rechazado' ? 'Rechazado' : 'Cancelado'}
    </span>
  );
  if (estado === 'pendiente') return (
    <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Pendiente
    </span>
  );
  if (!future) return (
    <span className="flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Finalizado
    </span>
  );
  return (
    <span className="flex items-center gap-1 badge-green"><CheckCircle className="w-3 h-3" /> Confirmado</span>
  );
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState('proximos');
  const [toast,    setToast]    = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(() => {
    publicService.getMyBookings()
      .then(setBookings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Carga inicial + polling cada 30s para detectar confirmaciones/rechazos
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const handleCancel = async (booking) => {
    if (!window.confirm(`¿Cancelar el turno del ${formatDate(booking.fecha)} a las ${booking.hora_inicio}?`)) return;
    setCancelling(booking.id);
    try {
      await publicService.cancelMyBooking(booking.id);
      showToast('success', 'Turno cancelado correctamente.');
      load();
    } catch (err) {
      showToast('error', err.message || 'No se pudo cancelar el turno.');
    } finally {
      setCancelling(null);
    }
  };

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const formatDate = (dateStr) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const filtered = bookings.filter(b => {
    const future  = isFuture(b);
    const active  = b.estado !== 'cancelado' && b.estado !== 'rechazado';
    if (filtro === 'proximos')   return future  && active;
    if (filtro === 'pasados')    return !future && active;
    if (filtro === 'cancelados') return b.estado === 'cancelado' || b.estado === 'rechazado';
    return true;
  });

  const proxCount = bookings.filter(b => isFuture(b) && b.estado !== 'cancelado').length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <Link to="/canchas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Volver a complejos
          </Link>

          <div className="flex items-center justify-between mb-6" data-aos="fade-up">
            <div>
              <h1 className="text-2xl font-bold">Mis turnos</h1>
              {proxCount > 0 && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {proxCount} turno{proxCount !== 1 ? 's' : ''} próximo{proxCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <Link to="/canchas" className="btn-primary text-sm py-2 px-4">
              + Reservar turno
            </Link>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {FILTROS.map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all
                  ${filtro === f.key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'
                  }`}>
                {f.label}
                {f.key === 'proximos' && proxCount > 0 && (
                  <span className={`ml-1.5 text-xs ${filtro === f.key ? 'text-white/80' : 'text-primary'}`}>
                    ({proxCount})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-16 text-muted-foreground">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">
                {filtro === 'proximos' ? 'No tenés turnos próximos'
                  : filtro === 'cancelados' ? 'Sin turnos cancelados'
                  : 'Sin turnos registrados'}
              </p>
              {filtro === 'proximos' && (
                <Link to="/canchas" className="text-primary text-sm hover:underline">
                  Reservar un turno →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((b, i) => {
                const future   = isFuture(b);
                const canCancel = future && b.estado !== 'cancelado';
                const field    = b.field;
                const complex  = field?.complex;

                return (
                  <div key={b.id}
                    data-aos="fade-up" data-aos-delay={Math.min(i * 50, 250)}
                    className={`card transition-opacity ${b.estado === 'cancelado' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-4">
                      {/* deporte icon */}
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                        {DEPORTE_ICON[field?.deporte] || '🏟️'}
                      </div>

                      {/* info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sm">{field?.nombre || 'Cancha'}</div>
                            {complex && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="font-medium text-foreground">{complex.nombre}</span>
                                {complex.ciudad && <><span className="text-border">·</span>{complex.ciudad}</>}
                              </div>
                            )}
                          </div>
                          <StatusBadge estado={b.estado} fecha={b.fecha} hora_inicio={b.hora_inicio} />
                        </div>

                        {/* fecha + hora */}
                        <div className="flex flex-wrap gap-3 mt-2">
                          <div className="flex items-center gap-1.5 text-sm">
                            <CalendarDays className="w-3.5 h-3.5 text-primary" />
                            <span className="capitalize">{formatDate(b.fecha)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {b.hora_inicio} → {b.hora_fin}
                            <span className="text-xs text-muted-foreground font-normal">({b.duracion} min)</span>
                          </div>
                        </div>

                        {/* precio + método */}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          {b.monto > 0 && (
                            <span className="font-semibold text-green-600 text-sm">
                              ${parseFloat(b.monto).toLocaleString('es-AR')}
                            </span>
                          )}
                          {b.metodo_pago && <span>{METODO_LABEL[b.metodo_pago] || b.metodo_pago}</span>}
                          {field?.techada !== undefined && (
                            <span>{field.techada ? '🏠 Techada' : '🌤 Al aire libre'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* botón cancelar */}
                    {canCancel && (
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-amber-600">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Solo podés cancelar hasta que comience el turno
                        </div>
                        <button
                          onClick={() => handleCancel(b)}
                          disabled={cancelling === b.id}
                          className="text-sm text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {cancelling === b.id ? 'Cancelando...' : 'Cancelar turno'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-lg text-sm font-medium text-white
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <Footer />
    </div>
  );
}
