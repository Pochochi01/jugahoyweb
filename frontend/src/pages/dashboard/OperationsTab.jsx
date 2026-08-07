import { useState, useEffect } from 'react';
import { operationsService } from '../../services/operationsService';
import { List } from 'lucide-react';

const TIPO_BADGE = { reserva: 'badge-blue', cancelacion: 'badge-red', confirmacion: 'badge-green', pago: 'badge-green', ajuste: 'badge-yellow' };

// Origen del movimiento (canal). 'chatbot' = WhatsApp; el resto se muestra como "Web".
const ORIGEN = {
  chatbot: { label: '💬 WhatsApp', cls: 'bg-green-100 text-green-700' },
  pwa:     { label: 'Web',         cls: 'bg-slate-100 text-slate-600' },
  web:     { label: 'Web',         cls: 'bg-slate-100 text-slate-600' },
};
const origenDe = (o) => ORIGEN[o] || ORIGEN.pwa;

export default function OperationsTab({ complexId }) {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState('');

  const load = () => {
    setLoading(true);
    operationsService.getByComplex(complexId, { tipo: tipo || undefined })
      .then(data => setOps(data.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [complexId, tipo]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Últimas Operaciones</h2>
        <select className="input w-auto text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="reserva">Reserva</option>
          <option value="cancelacion">Cancelación</option>
          <option value="confirmacion">Confirmación</option>
          <option value="pago">Pago</option>
          <option value="ajuste">Ajuste</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : ops.length === 0 ? (
        <div className="card text-center py-12 text-muted-foreground"><List className="w-10 h-10 mx-auto mb-2 opacity-30" />Sin operaciones registradas.</div>
      ) : (
        <div className="space-y-2">
          {ops.map(op => (
            <div key={op.id} className="card py-3 flex items-start gap-4">
              <div className="shrink-0 pt-0.5"><span className={`${TIPO_BADGE[op.tipo]} capitalize`}>{op.tipo}</span></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${origenDe(op.origen).cls}`}>
                    {origenDe(op.origen).label}
                  </span>
                  <span>{op.descripcion}</span>
                </div>
                {op.usuario && <div className="text-xs text-muted-foreground">{op.usuario.nombre} {op.usuario.apellido}</div>}
              </div>
              <div className="shrink-0 text-right">
                {op.monto && <div className="text-sm font-semibold text-green-600">${op.monto}</div>}
                <div className="text-xs text-muted-foreground">{new Date(op.fecha).toLocaleString('es-AR')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
