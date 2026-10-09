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
import SportIcon, { SportTile, SportChip, labelDeporte } from '../../components/SportIcon';
import { waLink } from '../../utils/whatsapp';
import { hoyAR, sumarDias } from '../../utils/fecha';

/** "lunes 5 de octubre" → "Lunes 5 de octubre" (solo la primera letra en mayúscula). */
function fechaLarga(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Próximos 7 días para el selector rápido. */
function proximosDias(desde, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const iso = shiftDate(desde, i);
    const d = new Date(iso + 'T12:00:00');
    const dia = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
    return { iso, dia: dia.charAt(0).toUpperCase() + dia.slice(1), num: d.getDate() };
  });
}

// Hoy en Argentina (no salta al día siguiente a las 21 hs, ver utils/fecha)
function today() { return hoyAR(); }
function shiftDate(d, n) { return sumarDias(d, n); }

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
      <main className="flex-1 bg-background py-6 sm:py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {/* back */}
          <Link to="/canchas" className="btn-ghost -ml-3 mb-4">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Complejos
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
            <section className="mb-6 flex items-start gap-4">
              <span className="hidden sm:grid place-items-center w-14 h-14 rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 shrink-0">
                <Building2 className="w-6 h-6" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.025em]">{complex.nombre}</h1>
                  <button onClick={toggleFav} disabled={favBusy}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    aria-pressed={isFav}
                    className="btn-icon shrink-0 -mr-2">
                    <Star className={`w-5 h-5 transition-transform duration-200 ease-out ${isFav ? 'fill-warning text-warning scale-110' : ''}`} />
                  </button>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {complex.direccion && <>{complex.direccion} · </>}
                    {complex.ciudad}{complex.provincia ? `, ${complex.provincia}` : ''}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[...new Set((complex.fields || []).map(f => f.deporte))].map(d => <SportChip key={d} deporte={d} />)}
                  <Link to={`/complejo/${id}/actividades`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Escuelas, profesores y torneos <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* navegación de fecha */}
          <section className="mb-5" aria-label="Elegí el día">
            <div className="flex items-center gap-2">
              <button onClick={() => setDate(d => (d > today() ? shiftDate(d, -1) : d))} disabled={date <= today()}
                className="btn-icon shrink-0" aria-label="Día anterior">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <label className="relative flex-1 min-w-0 flex items-center justify-center gap-2 rounded-lg py-2 cursor-pointer hover:bg-muted transition-colors duration-160">
                <CalendarDays className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span className="text-sm sm:text-base font-semibold truncate">{fechaLarga(date)}</span>
                <input type="date" value={date} min={today()} aria-label="Elegir fecha en el calendario"
                  onChange={e => e.target.value && setDate(e.target.value)}
                  onClick={e => e.currentTarget.showPicker?.()}
                  className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <button onClick={() => setDate(d => shiftDate(d, 1))} className="btn-icon shrink-0" aria-label="Día siguiente">
                <ChevronRight className="w-5 h-5" />
              </button>
              <button onClick={loadSlots} className="btn-icon shrink-0" aria-label="Actualizar turnos">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-3 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-1 snap-x" role="list">
              {proximosDias(today()).map(d => {
                const activo = d.iso === date;
                return (
                  <button key={d.iso} role="listitem" onClick={() => setDate(d.iso)} aria-pressed={activo}
                    className={`snap-start shrink-0 w-[4.25rem] rounded-xl border py-2 text-center transition-[background-color,border-color,color,transform] duration-160 ease-out active:scale-[0.97]
                      ${activo ? 'bg-primary border-primary text-primary-foreground shadow-sm' : 'bg-card border-border text-foreground hover:border-foreground/25'}`}>
                    <span className={`block text-2xs font-semibold uppercase tracking-wide ${activo ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{d.dia}</span>
                    <span className="block text-lg font-bold tabular">{d.num}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Toggle de agrupación (filtro) */}
          {!inviteFieldId && (
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold">Turnos libres</h2>
              <div className="segmented" role="group" aria-label="Ver turnos por">
                <button onClick={() => setViewMode('cancha')} aria-pressed={viewMode === 'cancha'} className="segmented-item">
                  <Building2 className="w-3.5 h-3.5" aria-hidden="true" /> Por cancha
                </button>
                <button onClick={() => setViewMode('horario')} aria-pressed={viewMode === 'horario'} className="segmented-item">
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" /> Por horario
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando turnos">
              {[0, 1, 2].map(i => (
                <div key={i} className="card p-4 flex items-center gap-3">
                  <div className="skeleton w-11 h-11 rounded-xl" />
                  <div className="flex-1 space-y-2"><div className="skeleton h-4 w-32" /><div className="skeleton h-3 w-48" /></div>
                </div>
              ))}
            </div>
          ) : !hasResults ? (
            <div className="card text-center py-14">
              <span className="mx-auto grid place-items-center w-12 h-12 rounded-2xl bg-muted mb-3">
                <CalendarDays className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="font-semibold">No quedan turnos libres el {fechaLarga(date).toLowerCase()}</p>
              <p className="text-sm text-muted-foreground mt-1">Probá otro día{wlHabilitado ? ' o anotate en la lista de espera de abajo' : ''}.</p>
              <button onClick={() => setDate(d => shiftDate(d, 1))} className="btn-outline mt-4">
                Ver el día siguiente <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : viewMode === 'cancha' ? (
            /* ── Vista POR CANCHA: acordeón con rango y turnos disponibles ── */
            <div className="space-y-3">
              {displayCanchas.map((c, ci) => {
                const open = openCancha === c.id;
                return (
                  <div key={c.id} className="card p-0 overflow-hidden">
                    <button onClick={() => setOpenCancha(open ? null : c.id)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors duration-160">
                      <SportTile deporte={c.deporte} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{c.nombre}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />{c.rango.label}
                          <span className="mx-1">·</span>
                          <span className="text-primary font-semibold">{c.count} turno{c.count !== 1 ? 's' : ''} libre{c.count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 animate-fade-in">
                        {c.starts.map(s => (
                          <button key={s.hora}
                            onClick={() => handleBook({ hora: s.hora, hora_fin: s.hora_fin }, c)}
                            aria-label={`Reservar ${c.nombre} a las ${s.hora}`}
                            className="min-h-[2.75rem] rounded-lg border border-border bg-background/40 text-sm font-semibold tabular
                                       hover:border-primary hover:bg-primary/10 hover:text-primary active:scale-[0.97]
                                       transition-[background-color,border-color,color,transform] duration-160 ease-out">
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
                  className="card p-4 text-left transition-[border-color,transform] duration-160 ease-out hover:border-primary/50 active:scale-[0.98]">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold tabular text-foreground">{g.hora}</span>
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
            <div className="card mt-6">
              <div className="flex items-start gap-2 mb-1">
                <Hourglass className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
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
                            ${sel ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                            {sel && <CheckCircle className="w-3.5 h-3.5" />}
                          </span>
                          <SportIcon deporte={o.deporte} className="w-5 h-5 text-primary shrink-0" />
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="hora-modal-titulo">
          <div className="absolute inset-0 bg-black/55 animate-fade-in" onClick={() => setHoraModal(null)} />
          <div className="relative z-10 w-full sm:max-w-lg bg-elevated border border-border rounded-t-2xl sm:rounded-2xl shadow-pop overflow-hidden animate-sheet-in sm:animate-pop-in pb-[env(safe-area-inset-bottom)]">
            <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            {/* cabecera */}
            <div className="px-5 pt-4 pb-3 sm:px-6 sm:pt-5 flex items-start justify-between gap-3 border-b border-border">
              <div className="min-w-0">
                <h2 id="hora-modal-titulo" className="text-xl font-extrabold tracking-tight">
                  <span className="tabular">{horaModal.hora}</span> hs · {fechaLarga(date)}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {horaModal.fields.length} cancha{horaModal.fields.length !== 1 ? 's' : ''} libre{horaModal.fields.length !== 1 ? 's' : ''}. Elegí una para reservar.
                </p>
              </div>
              <button onClick={() => setHoraModal(null)} aria-label="Cerrar" className="btn-icon -mr-2 -mt-1 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* lista de canchas disponibles */}
            <div className="p-4 sm:p-5 space-y-2 max-h-[65vh] overflow-y-auto overscroll-contain">
              {horaModal.fields.map(field => {
                const minPrice = fieldMinPrice(field);
                return (
                  <button key={field.id} onClick={() => handleBook(horaModal, field)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card
                               hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99] text-left
                               transition-[background-color,border-color,transform] duration-160 ease-out">
                    <SportTile deporte={field.deporte} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{field.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {labelDeporte(field.deporte)} · {field.techada ? 'Techada' : 'Al aire libre'}
                      </div>
                      {minPrice > 0 && (
                        <div className="text-xs font-semibold text-success mt-0.5 tabular">
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
          cargarOpcionesPago={(duracion) => publicService.opcionesPago(id, { field_id: selected.field.id, duracion })}
          playerData={{ nombre: `${user?.nombre} ${user?.apellido}`, telefono: telFromLink || user?.telefono }}
        />
      )}

      {/* toast */}
      {toast && (
        <div role="status" aria-live="polite"
          className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-elevated text-foreground shadow-pop text-sm font-medium animate-pop-in">
          {toast.type === 'success'
            ? <CheckCircle className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
            : <XCircle className="w-5 h-5 text-danger shrink-0" aria-hidden="true" />}
          {toast.msg}
        </div>
      )}

      {/* Modal de bloqueo por reiteradas inasistencias */}
      {bloqueo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/55 animate-fade-in" onClick={() => setBloqueo(null)} />
          <div className="relative z-10 bg-elevated border border-border rounded-2xl shadow-pop w-full max-w-sm p-6 text-center animate-pop-in" role="alertdialog" aria-modal="true" aria-labelledby="bloqueo-titulo">
            <div className="w-14 h-14 rounded-2xl bg-danger/12 flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-7 h-7 text-danger" aria-hidden="true" />
            </div>
            <h3 id="bloqueo-titulo" className="font-bold text-lg mb-2">No podés reservar por ahora</h3>
            <p className="text-sm text-muted-foreground mb-5">{bloqueo.message}</p>
            {waLink(bloqueo.whatsapp) && (
              <a href={waLink(bloqueo.whatsapp)} target="_blank" rel="noopener noreferrer"
                className="btn-primary w-full mb-2">
                Comunicarme por WhatsApp
              </a>
            )}
            <button onClick={() => setBloqueo(null)} className="btn-ghost w-full">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
