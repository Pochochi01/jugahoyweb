import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { MapPin, ChevronLeft, ChevronRight, CalendarDays, Star, CheckCircle, XCircle, RefreshCw, Link2 } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { publicService } from '../../services/publicService';
import { favoritesService } from '../../services/favoritesService';
import { paymentService } from '../../services/paymentService';
import { useAuth } from '../../context/AuthContext';
import BookingModal from '../../components/agenda/BookingModal';
import NeonBorderCell from '../../components/agenda/NeonBorderCell';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };

function today() { return new Date().toISOString().split('T')[0]; }
function shiftDate(d, n) {
  const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
}

export default function ComplexSlotsPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Filtrado por cancha invitada: viene de /invite/:token vía query param ?field=X
  const inviteFieldId = searchParams.get('field') ? parseInt(searchParams.get('field')) : null;
  const inviteContext = (() => {
    try { return JSON.parse(sessionStorage.getItem('inviteContext') || 'null'); } catch { return null; }
  })();
  const inviteFieldName = inviteContext?.fieldId === inviteFieldId ? inviteContext.fieldName : null;
  const [complex,  setComplex]  = useState(null);
  const [date,     setDate]     = useState(today());
  const [slots,    setSlots]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [allSlots, setAllSlots] = useState([]);  // para BookingModal
  const [selected, setSelected] = useState(null); // { slot, field }
  const [isFav,    setIsFav]    = useState(false);
  const [favBusy,  setFavBusy]  = useState(false);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    publicService.getComplex(id).then(setComplex).catch(() => {});
    // Estado de favorito desde la BD (fuente de verdad)
    favoritesService.getAll()
      .then(favs => setIsFav((favs || []).some(c => c.id === parseInt(id))))
      .catch(() => {});
  }, [id]);

  const loadSlots = useCallback(() => {
    setLoading(true);
    publicService.getSlots(id, date)
      .then(data => {
        setSlots(data.slots || []);
        // Construir lista plana para BookingModal (verificación de disponibilidad)
        const flat = [];
        (data.slots || []).forEach(s => {
          s.fields.forEach(f => {
            flat.push({ hora: s.hora, hora_fin: s.hora_fin, estado: 'libre', past: false, field_id: f.id, fecha: date });
          });
        });
        setAllSlots(flat);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [id, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const toggleFav = async () => {
    if (favBusy) return;
    setFavBusy(true);
    const next = !isFav;
    setIsFav(next); // optimista
    try {
      if (next) await favoritesService.add(parseInt(id));
      else      await favoritesService.remove(parseInt(id));
    } catch {
      setIsFav(!next); // rollback
      showToast('error', 'No se pudo actualizar el favorito.');
    } finally {
      setFavBusy(false);
    }
  };

  const handleBook = (slot, field) => {
    if (!user) { window.location.href = '/login'; return; }
    setSelected({ slot: { ...slot, field_id: field.id, fecha: date }, field });
  };

  const handleConfirm = async (formData) => {
    const { booking } = await publicService.reserve(id, formData);

    // Flujo MercadoPago: crear preference y redirigir al checkout
    if (formData.tipo_pago === 'seña' || formData.tipo_pago === 'total') {
      const pref = await paymentService.initMp({
        reserva_id: booking.id,
        cancha_id:  booking.field_id,
        player_id:  user?.id,
        tipoPago:   formData.tipo_pago,
      });
      const url = pref.init_point || pref.sandbox_init_point;
      if (!url) throw new Error('No se pudo iniciar el pago con MercadoPago.');
      window.location.href = url;   // sale del SPA hacia MercadoPago
      return;
    }

    // Pago en el complejo (offline)
    setSelected(null);
    showToast('success', '¡Turno reservado! Pagás en el complejo. Lo ves en Mis turnos.');
    loadSlots();
  };

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // Para BookingModal: construir allSlots filtrado por field
  const getAllSlotsForField = (fieldId) =>
    allSlots.filter(s => s.field_id === fieldId);

  // Si hay filtro por invitación, mostrar solo la cancha invitada
  const displaySlots = inviteFieldId
    ? slots
        .map(g => ({ ...g, fields: g.fields.filter(f => f.id === inviteFieldId) }))
        .filter(g => g.fields.length > 0)
    : slots;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {/* back */}
          <Link to="/canchas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Volver a complejos
          </Link>

          {/* Banner de cancha invitada */}
          {inviteFieldId && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary font-medium">
              <Link2 className="w-4 h-4 shrink-0" />
              Estás viendo los turnos de <strong className="ml-1">{inviteFieldName || `cancha #${inviteFieldId}`}</strong>
            </div>
          )}

          {/* header complejo */}
          {complex && (
            <div className="card mb-6 flex items-start gap-4" data-aos="fade-up">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                🏟️
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-xl font-bold">{complex.nombre}</h1>
                  <button onClick={toggleFav} disabled={favBusy}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    aria-pressed={isFav}
                    className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0 disabled:opacity-60">
                    <Star className={`w-5 h-5 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {complex.ciudad}{complex.provincia ? `, ${complex.provincia}` : ''}
                  {complex.direccion && <span>— {complex.direccion}</span>}
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {[...new Set((complex.fields || []).map(f => f.deporte))].map(d => (
                    <span key={d} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
                      {DEPORTE_ICON[d]} {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* navegación de fecha */}
          <div className="card py-3 px-4 flex items-center gap-3 mb-6">
            <button onClick={() => setDate(d => shiftDate(d, -1))}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold capitalize">
                {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>
            <button onClick={() => setDate(d => shiftDate(d, 1))}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="h-5 w-px bg-border" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={today()}
              className="text-xs text-muted-foreground border-none outline-none bg-transparent cursor-pointer" />
            {date !== today() && (
              <button onClick={() => setDate(today())} className="text-xs text-primary font-medium hover:underline">Hoy</button>
            )}
            <button onClick={loadSlots} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* slots agrupados */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : displaySlots.length === 0 ? (
            <div className="card text-center py-16 text-muted-foreground">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">Sin turnos disponibles</p>
              <p className="text-sm">Probá con otra fecha.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displaySlots.map((group, gi) => (
                <div key={group.hora} data-aos="fade-up" data-aos-delay={Math.min(gi * 50, 300)}>
                  {/* hora */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold tabular-nums text-primary">{group.hora}</span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">{group.fields.length} cancha{group.fields.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* cards de canchas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {group.fields.map(field => {
                      const minPrice = field.precios_por_duracion
                        ? Math.min(...Object.values(field.precios_por_duracion).filter(Boolean))
                        : parseFloat(field.precio_base || 0);
                      return (
                        // NeonBorderCell → mismo efecto neón que la agenda del admin
                        // (radius 12 = rounded-xl del .card). El punto verde recorre
                        // el borde en hover, indicando que el turno es reservable.
                        <NeonBorderCell key={field.id} radius={12} className="rounded-xl h-full">
                          <button
                            onClick={() => handleBook(group, field)}
                            className="card text-left w-full h-full hover:border-primary/40 transition-colors group"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl">{DEPORTE_ICON[field.deporte] || '🏃'}</span>
                              <div>
                                <div className="text-sm font-semibold group-hover:text-primary transition-colors">{field.nombre}</div>
                                <div className="text-xs text-muted-foreground capitalize">{field.deporte}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                              <span>{field.techada ? '🏠 Techada' : '🌤 Al aire libre'}</span>
                              {field.dimensiones && <span>{field.dimensiones}</span>}
                            </div>
                            {minPrice > 0 && (
                              <div className="mt-2 pt-2 border-t border-border text-sm font-semibold text-green-600">
                                Desde ${minPrice.toLocaleString('es-AR')}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                              <CheckCircle className="w-3.5 h-3.5" /> Reservar
                            </div>
                          </button>
                        </NeonBorderCell>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* modal de reserva */}
      {selected && (
        <BookingModal
          slot={{ ...selected.slot, hora_fin: selected.slot.hora_fin }}
          field={selected.field}
          allSlots={getAllSlotsForField(selected.field.id).concat(
            // agregar todos los slots de esa cancha para el día
            slots.flatMap(g => g.fields.includes(selected.field) || g.fields.find(f => f.id === selected.field.id)
              ? [{ hora: g.hora, hora_fin: g.hora_fin, estado: 'libre', past: false, field_id: selected.field.id, fecha: date }]
              : []
            )
          )}
          onConfirm={handleConfirm}
          onClose={() => setSelected(null)}
          playerMode
          mpEnabled={!!complex?.mp_enabled}
          playerData={{ nombre: `${user?.nombre} ${user?.apellido}`, telefono: user?.telefono }}
        />
      )}

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-lg text-sm font-medium text-white
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
