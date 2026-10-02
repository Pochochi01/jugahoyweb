import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { settingsService } from '../services/settingsService';

const MODALIDADES = [
  { value: 'complejo', label: 'Pagar en el complejo', hint: 'Se reserva y se paga en el lugar.' },
  { value: 'seña',     label: 'Seña con MercadoPago',  hint: 'Se asegura el turno con una seña online.' },
  { value: 'total',    label: 'Total con MercadoPago', hint: 'Se paga el turno completo online.' },
];

/**
 * Configuración GLOBAL de pagos del complejo (aplica a TODAS sus canchas):
 *  - modalidad predeterminada: la que aparece elegida al reservar en la web,
 *    en la agenda y primera en el chatbot (las tres se ofrecen siempre).
 *  - % de seña: se usa en las canchas que no tienen un monto de seña propio.
 * Solo se muestra con MercadoPago conectado.
 */
export default function ModalidadPagoConfig({ complexId }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    settingsService.get(complexId)
      .then(c => setF({ default_payment_option: c.default_payment_option || 'complejo', sena_porcentaje: c.sena_porcentaje ?? '' }))
      .catch(() => setF({ default_payment_option: 'complejo', sena_porcentaje: '' }));
  }, [complexId]);
  if (!f) return null;

  const guardar = async () => {
    setGuardando(true); setMsg(null);
    try {
      await settingsService.update(complexId, { default_payment_option: f.default_payment_option, sena_porcentaje: f.sena_porcentaje === '' ? null : Number(f.sena_porcentaje) });
      setMsg({ tipo: 'ok', texto: 'Guardado: aplica a todas las canchas del complejo.' });
    } catch (e) { setMsg({ tipo: 'error', texto: e?.message || 'No se pudo guardar.' }); }
    finally { setGuardando(false); }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div>
        <div className="text-sm font-semibold">Modalidad de pago predeterminada</div>
        <p className="text-xs text-muted-foreground">Aplica a todas las canchas. Al reservar se ofrecen las tres opciones; esta aparece elegida (web y agenda) y primera en el chatbot.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Modalidad predeterminada">
        {MODALIDADES.map(m => (
          <button key={m.value} type="button" role="radio" aria-checked={f.default_payment_option === m.value}
            onClick={() => setF(x => ({ ...x, default_payment_option: m.value }))}
            className={`text-left rounded-lg border-2 px-3 py-2 transition-colors ${f.default_payment_option === m.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
            <div className="text-sm font-medium">{m.label}</div>
            <div className="text-[11px] text-muted-foreground">{m.hint}</div>
          </button>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">
        Seña (% del turno) para canchas sin monto de seña propio
        <div className="flex items-center gap-2 mt-1">
          <input type="number" min="1" max="100" className="input !w-24" placeholder="Ej: 30" value={f.sena_porcentaje}
            onChange={e => setF(x => ({ ...x, sena_porcentaje: e.target.value }))} />
          <span>%</span>
          <span className="text-[11px]">Vacío = esas canchas no ofrecen seña (solo el monto fijo de cada cancha).</span>
        </div>
      </label>
      {msg && <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.texto}</p>}
      <button className="btn-primary text-sm flex items-center gap-1.5" disabled={guardando} onClick={guardar}>
        <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar modalidad'}
      </button>
    </div>
  );
}
