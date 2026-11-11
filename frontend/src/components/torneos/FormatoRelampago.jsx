import { Zap } from 'lucide-react';
import * as fmt from '../../utils/formatoPartido';

/**
 * Torneo Relámpago: configuración del partido por fase (Zonas, Cuartos, Semifinales, Final).
 * Zonas / cuartos / semis: set único (games + tie-break). Final: set único, 2 sets + súper TB
 * o 2 sets con 3º completo. El backend valida y normaliza lo mismo (formatoPartido.normalizarFormato).
 */
const OPC = {
  games: [3, 4, 5, 6, 7, 8, 9, 10, 12],
  tiebreak: [5, 7, 10, 12, 15],
  super_tiebreak: [7, 10, 15, 21],
};
const TIPOS_FINAL = [
  ['un_set', 'Un set único'],
  ['dos_sets_super_tb', 'Dos sets + súper tie-break'],
  ['mejor_de_3', 'Dos sets (si empatan, 3º set completo)'],
];

function Numero({ label, k, regla, onChange, disabled }) {
  const [min, max] = fmt.LIMITES[k];
  const opciones = [...new Set([...OPC[k], regla[k]])].filter(v => v >= min && v <= max).sort((a, b) => a - b);
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <select className="input" value={regla[k]} disabled={disabled} onChange={e => onChange({ ...regla, [k]: Number(e.target.value) })}>
        {opciones.map(v => <option key={v} value={v}>{v}{k === 'games' ? ' games' : ' puntos'}</option>)}
      </select>
    </label>
  );
}

function TarjetaFase({ fase, regla, onChange, disabled }) {
  const esFinal = fase === 'final';
  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{fmt.FASE_LABEL[fase]}</div>
        <div className="text-[11px] text-muted-foreground text-right">{fmt.describirRegla(regla)}</div>
      </div>
      {esFinal && (
        <div className="grid gap-1.5" role="radiogroup" aria-label="Modo de la final">
          {TIPOS_FINAL.map(([k, l]) => (
            <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${regla.tipo === k ? 'border-primary bg-primary/10' : 'border-border'}`}>
              <input type="radio" disabled={disabled} checked={regla.tipo === k} onChange={() => onChange({ ...regla, tipo: k, super_tiebreak: regla.super_tiebreak || 10 })} /> {l}
            </label>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Numero label={esFinal && regla.tipo !== 'un_set' ? 'Games por set' : 'Games para ganar'} k="games" regla={regla} onChange={onChange} disabled={disabled} />
        <Numero label="Tie-break a" k="tiebreak" regla={regla} onChange={onChange} disabled={disabled} />
        {regla.tipo === 'dos_sets_super_tb' && <Numero label="Súper tie-break a" k="super_tiebreak" regla={regla} onChange={onChange} disabled={disabled} />}
        <label className="flex items-center gap-2 text-xs text-muted-foreground self-end pb-2.5 col-span-2 sm:col-span-1">
          <input type="checkbox" disabled={disabled} checked={!regla.ventaja} onChange={e => onChange({ ...regla, ventaja: !e.target.checked })} />
          Sin ventaja (tie-break en {regla.games - 1}-{regla.games - 1})
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">Resultados válidos del set: {fmt.ayudaSet(regla)}.</p>
    </div>
  );
}

/**
 * @param {{ value: object|null, onChange: (cfg) => void, fasesBloqueadas?: string[] }} props
 */
export default function FormatoRelampago({ value, onChange, fasesBloqueadas = [] }) {
  let cfg;
  try { cfg = fmt.normalizarFormato(value); } catch { cfg = fmt.normalizarFormato(null); }
  return (
    <section className="md:col-span-2 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Zap className="w-4 h-4 text-amber-400" /> Configuración de partidos · Relámpago</div>
      <p className="text-[11px] text-muted-foreground -mt-2">Cada fase define cuántos games se juegan y a cuántos puntos va el tie-break. 16avos y octavos usan la configuración de cuartos.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {fmt.FASES.map(f => (
          <TarjetaFase key={f} fase={f} regla={cfg[f]} disabled={fasesBloqueadas.includes(f)}
            onChange={(r) => onChange({ ...cfg, [f]: r })} />
        ))}
      </div>
      {fasesBloqueadas.length > 0 && <p className="text-[11px] text-amber-400">Las fases con resultados cargados no se pueden reconfigurar.</p>}
    </section>
  );
}

/** Resumen compacto del formato (pantallas del torneo, organizador y jugadores). */
export function ResumenRelampago({ torneo, className = '' }) {
  const filas = fmt.resumenFormato(torneo);
  if (!filas) return null;
  return (
    <div className={`card ${className}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-400" /> Formato Relámpago</div>
      <dl className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {filas.map(f => (
          <div key={f.fase} className="flex gap-2"><dt className="text-muted-foreground shrink-0">{f.label.replace(' (y rondas previas)', '')}:</dt><dd>{f.texto}</dd></div>
        ))}
      </dl>
    </div>
  );
}
