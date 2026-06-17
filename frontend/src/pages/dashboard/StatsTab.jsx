import { useState, useEffect } from 'react';
import { statsService } from '../../services/statsService';
import { BarChart2, TrendingUp, Calendar, Percent } from 'lucide-react';

export default function StatsTab({ complexId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const load = () => {
    setLoading(true);
    statsService.getByComplex(complexId, { desde: desde || undefined, hasta: hasta || undefined })
      .then(setStats).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [complexId]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold">Estadísticas</h2>
        <div className="flex gap-2 items-center">
          <input type="date" className="input text-sm w-auto" value={desde} onChange={e => setDesde(e.target.value)} placeholder="Desde" />
          <span className="text-muted-foreground text-sm">→</span>
          <input type="date" className="input text-sm w-auto" value={hasta} onChange={e => setHasta(e.target.value)} placeholder="Hasta" />
          <button onClick={load} className="btn-primary text-sm py-2 px-4">Filtrar</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : !stats ? (
        <div className="card text-center py-12 text-muted-foreground"><BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />Sin datos.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Reservas', value: stats.reservas, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Ingresos', value: `$${stats.ingresos?.toFixed(2)}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total turnos', value: stats.totalTurnos, icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Ocupación', value: `${stats.porcentajeOcupacion}%`, icon: Percent, color: 'text-orange-500', bg: 'bg-orange-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`card ${bg} border-0`} data-aos="zoom-in">
              <Icon className={`w-6 h-6 ${color} mb-2`} />
              <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
