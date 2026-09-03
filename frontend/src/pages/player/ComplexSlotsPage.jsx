import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { MapPin, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Star, CheckCircle, XCircle, RefreshCw, Link2, Clock, Building2, LayoutGrid, X, Bell, Hourglass } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { publicService } from '../../services/publicService';
import { favoritesService } from '../../services/favoritesService';
import { paymentService } from '../../services/paymentService';
import { useAuth } from '../../context/AuthContext';
import BookingModal from '../../components/agenda/BookingModal';
import { waLink } from '../../utils/whatsapp';

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
  // Teléfono enviado en el link (ej. ?tel=549...) para autocompletar el formulario.
  const telFromLink = (searchParams.get('tel') || '').trim();
  const inviteContext = (() => {
    try { return JSON.parse(sessionStorage.getItem('inviteContext') || 'null'); } catch { return null; }
  })();
  const inviteFieldName = inviteContext?.fieldId === inviteFieldId ? inviteContext.fieldName : null;
  const [complex,  setComplex]  = useState(null);
  const [date,     setDate]     = useState(today());
  const [slots,    setSlots]    = useState([]);   // agrupado por horario
  const [canchas,  setCanchas]  = useState([]);   // agrupado por cancha
  const [loading,  setLoading]  = useState(true);
  const [allSlots, setAllSlots] = useState([]);  // para BookingModal
  const [selected, setSelected] = useState(null); // { slot, field }
  const [isFav,    setIsFav]    = useState(false);
  const [favBusy,  setFavBusy]  = useState(false);
  const [toast,    setToast]    = useState(null);
  const [bloqueo,  setBloqueo]  = useState(null);   // { message, whatsapp } por reiteradas inasistencias

  // ── Lista de espera ──
  const [wlHabilitado, setWlHabilitado] = useState(false);
  const [ocupados,     setOcupados]     = useState([]);       // turnos ocupados del día
  const [wlSel,        setWlSel]        = useState(new Set()); // keys `${field_id}_${hora}` seleccionadas
  const [wlSaving,     setWlSaving]     = useState(false);
  const [wlForm,       setWlForm]       = useState({ nombre: '', telefono: '', email: '' });

  // Vista: agrupar por cancha o por horario (filtro pedido para móvil)
  const [viewMode,   setViewMode]   = useState('cancha'); // 'cancha' | 'horario'
  const [openCancha, setOpenCancha] = useState(null);     // id de cancha expandida (vista por cancha)
  const [horaModal,  setHoraModal]  = useState(null);     // grupo de la hora elegida → modal (vista por horario)

  useEffect(() => {
    publicService.getComplex(id).then(setComplex).catch(() => {});
    // Estado de favorito desde la BD (fuente de verdad)
    favoritesService.getAll()
      .then(favs => setIsFav((favs || []).some(c => c.id === parseInt(id))))
      .catch(() => {});
  }, [id]);

  // Prefill de datos del usuario para la lista de espera (teléfono del link si vino).
  useEffect(() => {
    setWlForm(f => ({
      nombre:   f.nombre   || `${user?.nombre || ''} ${user?.apellido || ''}`.trim(),
      telefono: f.telefono || telFromLink || user?.telefono || '',
      email:    f.email    || user?.email    || '',
    }));
  }, [user, telFromLink]);

  // Turnos ocupados + estado del módulo de lista de espera (por fecha).
  useEffect(() => {
    setWlSel(new Set());
    publicService.getOcupados(id, date)
      .then(d => { setWlHabilitado(!!d.habilitado); setOcupados(d.ocupados || []); })
      .catch(() => { setWlHabilitado(false); setOcupados([]); });
  }, [id, date]);

  const loadSlots = useCallback(() => {
    setLoading(true);
    setOpenCancha(null); setHoraModal(null);
    publicService.getSlots(id, date)
      .then(data => {
        setSlots(data.slots || []);
        setCanchas(data.canchas || []);
        // Construir lista plana para BookingModal (verificación de disponibilidad)
        const flat = [];
        (data.slots || []).forEach(s => {
          s.fields.forEach(f => {
            flat.push({ hora: s.hora, hora_fin: s.hora_fin, estado: 'libre', past: false, field_id: f.id, fecha: date });
          });
        });
        setAllSlots(flat);
      })
      .catch(() => { setSlots([]); setCanchas([]); })
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

  const handleBook = async (slot, field) => {
    if (!user) { window.location.href = '/login'; return; }
    // Verificar bloqueo por inasistencias ANTES de abrir el formulario de reserva.
    try {
      const b = await publicService.checkBloqueo(id);
      if (b?.blocked) {
        setHoraModal(null);
        setBloqueo({ message: b.message, whatsapp: b.whatsapp });
        return;
      }
    } catch { /* si falla el chequeo, seguimos: el backend igual valida al reservar */ }
    setHoraModal(null); // cerrar el modal de selección de cancha si estaba abierto
    setSelected({ slot: { ...slot, field_id: field.id, fecha: date }, field });
  };

  const handleConfirm = async (formData) => {
    let booking;
    try {
      ({ booking } = await publicService.reserve(id, formData));
    } catch (err) {
      // Bloqueo por reiteradas inasistencias → mostrar mensaje + contacto WhatsApp
      if (err?.blocked_inasistencias) {
        setSelected(null);
        setBloqueo({ message: err.message, whatsapp: err.whatsapp });
        return;
      }
      throw err;   // otros errores los muestra el propio modal de reserva
    }

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

  // ── Lista de espera ──
  const wlKey = (o) => `${o.field_id}_${o.hora}`;
  const toggleWl = (o) => setWlSel(s => {
    const n = new Set(s); const k = wlKey(o);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const submitWaitlist = async () => {
    if (!user) { window.location.href = '/login'; return; }
    if (wlSel.size === 0) { showToast('error', 'Elegí al menos un turno ocupado.'); return; }
    if (!wlForm.telefono.trim() && !wlForm.email.trim()) {
      showToast('error', 'Ingresá teléfono o email para poder avisarte.'); return;
    }
    setWlSaving(true);
    try {
      const turnos = ocupados.filter(o => wlSel.has(wlKey(o)))
        .map(o => ({ field_id: o.field_id, fecha: o.fecha, hora: o.hora, duracion: o.duracion, deporte: o.deporte }));
      const res = await publicService.addWaitlist(id, {
        turnos, nombre: wlForm.nombre.trim(), telefono: wlForm.telefono.trim(), email: wlForm.email.trim(),
      });
      showToast('success', res?.message || 'Te anotamos en la lista de espera.');
      setWlSel(new Set());
      publicService.getOcupados(id, date)
        .then(d => { setWlHabilitado(!!d.habilitado); setOcupados(d.ocupados || []); }).catch(() => {});
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'No se pudo anotar en la lista de espera.');
    } finally { setWlSaving(false); }
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
  const displayCanchas = inviteFieldId ? canchas.filter(c => c.id === inviteFieldId) : canchas;

  const hasResults = viewMode === 'cancha' ? displayCanchas.length > 0 : displaySlots.length > 0;

  // Precio mínimo de una cancha (precios_por_duracion o precio_base)
  const fieldMinPrice = (field) =>
    field.precios_por_duracion && Object.keys(field.precios_por_duracion).length
      ? Math.min(...Object.values(field.precios_por_duracion).filter(Boolean))
      : parseFloat(field.precio_base || 0);

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

          {/* Toggle de agrupación (filtro) */}
          {!inviteFieldId && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Ver turnos agrupados por:</span>
              <div className="inline-flex rounded-xl border border-border overflow-hidden text-sm shrink-0">
                <button onClick={() => setViewMode('cancha')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${viewMode === 'cancha' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Building2 className="w-3.5 h-3.5" /> Cancha
                </button>
                <button onClick={() => setViewMode('horario')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${viewMode === 'horario' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  <LayoutGrid className="w-3.5 h-3.5" /> Horario
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : !hasResults ? (
            <div className="card text-center py-16 text-muted-foreground">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">Sin turnos disponibles</p>
              <p className="text-sm">Probá con otra fecha.</p>
            </div>
          ) : viewMode === 'cancha' ? (
            /* ── Vista POR CANCHA: acordeón con rango y turnos disponibles ── */
            <div className="space-y-3">
              {displayCanchas.map((c, ci) => {
                const open = openCancha === c.id;
                return (
                  <div key={c.id} className="card p-0 overflow-hidden" data-aos="fade-up" data-aos-delay={Math.min(ci * 40, 200)}>
                    <button onClick={() => setOpenCancha(open ? null : c.id)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors">
                      <span className="text-2xl shrink-0">{DEPORTE_ICON[c.deporte] || '🏃'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{c.nombre}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3 inline mr-1" />{c.rango.label}
                          <span className="mx-1">·</span>
                          <span className="text-primary font-semibold">{c.count} turno{c.count !== 1 ? 's' : ''} libre{c.count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1 grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {c.starts.map(s => (
                          <button key={s.hora}
                            onClick={() => handleBook({ hora: s.hora, hora_fin: s.hora_fin }, c)}
                            className="py-2.5 rounded-lg border border-border text-sm font-semibold tabular-nums
                                       hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors">
                            {s.hora}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Vista POR HORARIO: grilla de 2 columnas → modal al elegir hora ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {displaySlots.map((g) => (
                <button key={g.hora} onClick={() => setHoraModal(g)}
                  className="card text-left transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tabular-nums text-primary">{g.hora}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {g.count} cancha{g.count !== 1 ? 's' : ''} disponible{g.count !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Lista de espera ── */}
          {wlHabilitado && (
            <div className="card mt-6" data-aos="fade-up">
              <div className="flex items-start gap-2 mb-1">
                <Hourglass className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-bold">Lista de espera</h2>
                  <p className="text-sm text-muted-foreground">
                    ¿No hay turno libre? Anotate en los turnos <strong>ocupados</strong> y te avisamos si se liberan
                    (podés elegir varios).
                  </p>
                </div>
              </div>

              {ocupados.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No hay turnos ocupados para esta fecha.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {ocupados.map(o => {
                      const sel = wlSel.has(wlKey(o));
                      return (
                        <button key={wlKey(o)} type="button" onClick={() => toggleWl(o)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all
                            ${sel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0
                            ${sel ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                            {sel && <CheckCircle className="w-3.5 h-3.5" />}
                          </span>
                          <span className="text-lg shrink-0">{DEPORTE_ICON[o.deporte] || '🏃'}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{o.field_nombre} · {o.hora} hs</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {o.deporte} · {o.hora}–{o.hora_fin} ({o.duracion} min)
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                    <input className="input" placeholder="Nombre" value={wlForm.nombre}
                      onChange={e => setWlForm(f => ({ ...f, nombre: e.target.value }))} />
                    <input className="input" placeholder="Teléfono" value={wlForm.telefono}
                      onChange={e => setWlForm(f => ({ ...f, telefono: e.target.value }))} />
                    <input className="input" placeholder="Email" value={wlForm.email}
                      onChange={e => setWlForm(f => ({ ...f, email: e.target.value }))} />
                  </div>

                  <button onClick={submitWaitlist} disabled={wlSaving || wlSel.size === 0}
                    className="btn-primary mt-3 flex items-center gap-2 disabled:opacity-50">
                    <Bell className="w-4 h-4" />
                    {wlSaving ? 'Anotando...' : `Anotarme en la lista de espera${wlSel.size ? ` (${wlSel.size})` : ''}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* modal: elegir cancha para el horario seleccionado (vista por horario) */}
      {horaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setHoraModal(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* cabecera */}
            <div className="bg-primary px-6 py-4 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight">Turno de las {horaModal.hora} hs</h2>
                  <p className="text-sm text-white/85 truncate">
                    {horaModal.fields.length} cancha{horaModal.fields.length !== 1 ? 's' : ''} disponible{horaModal.fields.length !== 1 ? 's' : ''} — elegí una
                  </p>
                </div>
              </div>
              <button onClick={() => setHoraModal(null)} aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-white/20 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* lista de canchas disponibles */}
            <div className="p-4 sm:p-5 space-y-2.5 max-h-[65vh] overflow-y-auto">
              {horaModal.fields.map(field => {
                const minPrice = fieldMinPrice(field);
                return (
                  <button key={field.id} onClick={() => handleBook(horaModal, field)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200
                               hover:border-primary hover:bg-primary/5 text-left transition-all">
                    <span className="text-2xl shrink-0">{DEPORTE_ICON[field.deporte] || '🏃'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{field.nombre}</div>
                      <div className="text-xs text-slate-500 capitalize">
                        {field.deporte}{field.techada ? ' · 🏠 Techada' : ' · 🌤 Aire libre'}
                      </div>
                      {minPrice > 0 && (
                        <div className="text-xs font-semibold text-green-600 mt-0.5">
                          Desde ${minPrice.toLocaleString('es-AR')}
                        </div>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
                      Reservar <ChevronRight className="w-4 h-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
          playerData={{ nombre: `${user?.nombre} ${user?.apellido}`, telefono: telFromLink || user?.telefono }}
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

      {/* Modal de bloqueo por reiteradas inasistencias */}
      {bloqueo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBloqueo(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg mb-2">No podés agendar</h3>
            <p className="text-sm text-muted-foreground mb-5">{bloqueo.message}</p>
            {waLink(bloqueo.whatsapp) && (
              <a href={waLink(bloqueo.whatsapp)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-semibold text-white mb-2"
                style={{ background: '#16a34a' }}>
                Comunicarme por WhatsApp
              </a>
            )}
            <button onClick={() => setBloqueo(null)} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
