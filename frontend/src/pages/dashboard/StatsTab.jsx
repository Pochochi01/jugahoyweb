import { useState, useEffect } from 'react';
import { statsService } from '../../services/statsService';
import {
  BarChart2, TrendingUp, Calendar, Percent, CheckCircle, UserX, DollarSign, X,
} from 'lucide-react';

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function StatsTab({ complexId }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [desde,   setDesde]   = useState('');
  const [hasta,   setHasta]   = useState('');

  // Modal con la lista de no asistidos
  const [showNoShows, setShowNoShows] = useState(false);
  const [noShows,     setNoShows]     = useState([]);
  const [loadingNS,   setLoadingNS]   = useState(false);

  const load = () => {
    setLoading(true);
    statsService.getAttendance(complexId, { desde: desde || undefined, hasta: hasta || undefined })
      .then(setStats).catch(() => setStats(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [complexId]);   // eslint-disable-line

  const abrirNoAsistidos = () => {
    setShowNoShows(true);
    setLoadingNS(true);
    statsService.getNoShows(complexId, { desde: desde || undefined, hasta: hasta || undefined })
      .then(setNoShows).catch(() => setNoShows([])).finally(() => setLoadingNS(false));
  };

  const formatFecha = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });

  // Definición de los slots (cards). Los dos de "no asistidos" son clicables.
  const cards = stats ? [
    { label: 'Reservas',            value: stats.reservas,                     icon: Calendar,    color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Ingresos',            value: money(stats.ingresos),              icon: TrendingUp,  color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Turnos asistidos',    value: stats.asistidos,                    icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { label: 'Ingresos asistidos',  value: money(stats.ingresos_asistidos),    icon: DollarSign,  color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Ocupación',           value: `${stats.ocupacion}%`,              icon: Percent,     color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'No asistidos',        value: stats.no_asistidos,                 icon: UserX,       color: 'text-red-600',    bg: 'bg-red-50',    onClick: abrirNoAsistidos },
    { label: 'Ingresos no asistidos', value: money(stats.ingresos_no_asistidos), icon: DollarSign, color: 'text-rose-600',  bg: 'bg-rose-50',   onClick: abrirNoAsistidos },
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
          {cards.map(({ label, value, icon: Icon, color, bg, onClick }) => (
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
            </div>
          ))}
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
