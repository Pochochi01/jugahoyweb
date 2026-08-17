import { useState, useEffect } from 'react';
import { statsService } from '../../services/statsService';
import { agendaService } from '../../services/agendaService';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart2, TrendingUp, Calendar, Percent, CheckCircle, UserX, DollarSign, X, Ban, UserCheck,
} from 'lucide-react';

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

// Rango del mes en curso (por defecto si no se ingresan fechas).
function mesEnCurso() {
  const now = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  return {
    desde: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    hasta: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export default function StatsTab({ complexId }) {
  const { isComplexAdmin } = useAuth();   // gestión de incumplidos: solo administradores
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Lista de incumplidos (blacklist por inasistencias)
  const [incumplidos, setIncumplidos] = useState([]);
  const [habilitando, setHabilitando] = useState(null);
  // Pre-cargado con el mes en curso; el admin puede cambiar el rango.
  const [desde,   setDesde]   = useState(mesEnCurso().desde);
  const [hasta,   setHasta]   = useState(mesEnCurso().hasta);

  // Modal con la lista de no asistidos
  const [showNoShows, setShowNoShows] = useState(false);
  const [noShows,     setNoShows]     = useState([]);
  const [loadingNS,   setLoadingNS]   = useState(false);

  // Si el usuario borra las fechas, se usa el mes en curso.
  const rango = () => ({
    desde: desde || mesEnCurso().desde,
    hasta: hasta || mesEnCurso().hasta,
  });

  const load = () => {
    setLoading(true);
    statsService.getAttendance(complexId, rango())
      .then(setStats).catch(() => setStats(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [complexId]);   // eslint-disable-line

  const loadIncumplidos = () => {
    if (!isComplexAdmin) return;
    agendaService.getIncumplidos(complexId).then(setIncumplidos).catch(() => setIncumplidos([]));
  };
  useEffect(() => { loadIncumplidos(); }, [complexId, isComplexAdmin]);   // eslint-disable-line

  const habilitar = async (inc) => {
    if (!window.confirm(`¿Habilitar a ${inc.nombre || inc.telefono} para agendar nuevamente?`)) return;
    setHabilitando(inc.id);
    try {
      await agendaService.habilitarIncumplido(complexId, inc.id);
      setIncumplidos(list => list.filter(i => i.id !== inc.id));
    } catch { /* noop */ } finally { setHabilitando(null); }
  };

  const abrirNoAsistidos = () => {
    setShowNoShows(true);
    setLoadingNS(true);
    statsService.getNoShows(complexId, rango())
      .then(setNoShows).catch(() => setNoShows([])).finally(() => setLoadingNS(false));
  };

  const formatFecha = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });

  // Definición de los slots (cards). El de "No asistidos" unifica cantidad + monto
  // y es clicable para ver el listado.
  const cards = stats ? [
    { label: 'Reservas',            value: stats.reservas,                     icon: Calendar,    color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Ingresos',            value: money(stats.ingresos),              icon: TrendingUp,  color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Turnos asistidos',    value: stats.asistidos,                    icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { label: 'Ingresos asistidos',  value: money(stats.ingresos_asistidos),    icon: DollarSign,  color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Ocupación',           value: `${stats.ocupacion}%`,              icon: Percent,     color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'No asistidos',        value: stats.no_asistidos, sub: money(stats.ingresos_no_asistidos),
      icon: UserX, color: 'text-red-600', bg: 'bg-red-50', onClick: abrirNoAsistidos },
  ] : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold">Estadísticas</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className="input text-sm w-auto" value={desde} onChange={e => setDesde(e.target.value)} />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="date" className="input text-sm w-auto" value={hasta} onChange={e => setHasta(e.target.value)} />
          <button onClick={load} className="btn-primary text-sm py-2 px-4">Filtrar</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : !stats ? (
        <div className="card text-center py-12 text-muted-foreground"><BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />Sin datos.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map(({ label, value, sub, icon: Icon, color, bg, onClick }) => (
            <div key={label}
              onClick={onClick}
              className={`card ${bg} border-0 ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-red-300 transition-all' : ''}`}
              data-aos="zoom-in">
              <div className="flex items-center justify-between">
                <Icon className={`w-6 h-6 ${color} mb-2`} />
                {onClick && <span className="text-[10px] text-red-500 font-medium">ver lista →</span>}
              </div>
              <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
              {sub !== undefined && <div className={`text-sm font-semibold ${color} mt-1`}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Lista de incumplidos — solo administradores */}
      {isComplexAdmin && (
        <div className="mt-8">
          <h3 className="font-bold flex items-center gap-2 mb-3">
            <Ban className="w-5 h-5 text-red-600" /> Lista de incumplidos
            {incumplidos.length > 0 && <span className="badge-red text-xs">{incumplidos.length}</span>}
          </h3>
          {incumplidos.length === 0 ? (
            <div className="card text-sm text-muted-foreground py-6 text-center">
              No hay jugadores bloqueados por inasistencias.
            </div>
          ) : (
            <div className="space-y-2">
              {incumplidos.map(inc => (
                <div key={inc.id} className="card py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{inc.nombre || 'Sin nombre'}</div>
                    <div className="text-xs text-muted-foreground">
                      {inc.telefono || inc.tel_key}
                      {inc.user_id && <> · cuenta #{inc.user_id}</>}
                    </div>
                  </div>
                  <button onClick={() => habilitar(inc)} disabled={habilitando === inc.id}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', borderColor: 'rgba(34,197,94,0.3)' }}>
                    <UserCheck className="w-4 h-4" />
                    {habilitando === inc.id ? '...' : 'Habilitar'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Los jugadores salen de la lista al habilitarlos manualmente, o automáticamente tras 30 días sin faltas y 2 turnos asistidos.
          </p>
        </div>
      )}

      {/* Modal: lista de turnos no asistidos */}
      {showNoShows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowNoShows(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold flex items-center gap-2 text-red-600"><UserX className="w-5 h-5" /> Turnos no asistidos</h3>
              <button onClick={() => setShowNoShows(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {loadingNS ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-2 border-red-400 border-t-transparent" /></div>
              ) : noShows.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Sin turnos no asistidos en el rango.</p>
              ) : noShows.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.nombre_cliente}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatFecha(t.fecha)} · {t.hora_inicio}–{t.hora_fin}
                      {t.field && <> · {t.field.identificador || t.field.nombre}</>}
                      {t.telefono_cliente && <> · {t.telefono_cliente}</>}
                    </div>
                  </div>
                  {t.monto > 0 && <span className="font-bold text-rose-600 shrink-0">{money(t.monto)}</span>}
                </div>
              ))}
            </div>
            {!loadingNS && noShows.length > 0 && (
              <div className="px-5 py-3 border-t text-sm text-muted-foreground flex justify-between">
                <span>{noShows.length} turno{noShows.length !== 1 ? 's' : ''}</span>
                <span className="font-semibold text-rose-600">{money(noShows.reduce((s, t) => s + Number(t.monto || 0), 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
