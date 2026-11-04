import { Trophy, AlertTriangle, Pencil } from 'lucide-react';
import { RONDA_LABEL, fechaCorta, setsTxt } from '../../utils/torneos';

/** Tabla de posiciones de una zona (persistida en el backend). */
export function TablaZona({ zona, mostrarRanking = false }) {
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-2.5 font-semibold border-b border-border flex items-center justify-between">
        {zona.nombre}
        {zona.completa && <span className="badge-green">Completa</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Pareja</th>
              {mostrarRanking && <th className="px-2 py-2 text-center" title="Puntos de ranking anual">Rk</th>}
              <th className="px-2 py-2 text-center">PJ</th><th className="px-2 py-2 text-center">PG</th>
              <th className="px-2 py-2 text-center">PP</th><th className="px-2 py-2 text-center" title="Diferencia de sets">DS</th>
              <th className="px-2 py-2 text-center" title="Diferencia de games">DG</th><th className="px-3 py-2 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {zona.tabla.map(r => (
              <tr key={r.pareja_id} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.posicion}°</td>
                <td className="px-3 py-2 min-w-[170px]">
                  {r.numero_zona && <span className="text-[10px] text-muted-foreground mr-1.5 font-mono" title="Número en la zona">{r.numero_zona}.</span>}
                  {r.numero_zona === 1 && <span className="mr-1" title="Cabeza de serie" aria-label="Cabeza de serie">🏆</span>}
                  {r.pareja}
                  {r.siembra && <span className="ml-1.5 badge-neutral !text-[10px] !px-1.5 !py-0" title="Posición en el ranking general al armar las zonas">#{r.siembra}</span>}
                </td>
                {mostrarRanking && <td className="px-2 py-2 text-center text-muted-foreground">{r.puntos_ranking}</td>}
                <td className="px-2 py-2 text-center">{r.pj}</td>
                <td className="px-2 py-2 text-center">{r.pg}</td>
                <td className="px-2 py-2 text-center">{r.pp}</td>
                <td className="px-2 py-2 text-center">{r.dif_sets > 0 ? '+' : ''}{r.dif_sets}</td>
                <td className="px-2 py-2 text-center">{r.dif_games > 0 ? '+' : ''}{r.dif_games}</td>
                <td className="px-3 py-2 text-center font-bold text-primary">{r.puntos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const resultadoTxt = (p) => (p.estado === 'walkover' && !p.es_bye ? 'W.O.' : setsTxt(p.resultado?.sets, p.resultado?.tie_breaks));

/** Nombre de una pareja en un partido; los lugares a definir ("Ganador P1") van en cursiva. */
function NombrePareja({ par, gano, fallback = 'A definir' }) {
  if (!par) return <span className="text-muted-foreground italic">{fallback}</span>;
  if (par.pendiente) return <span className="text-muted-foreground italic">{par.nombre}</span>;
  return (
    <span className={gano ? 'font-semibold text-primary' : ''}>
      {par.numero_zona && <span className="text-[11px] text-muted-foreground mr-1.5 font-mono">#{par.numero_zona}</span>}
      {par.nombre}
    </span>
  );
}

/** Línea de partido (fixture). `acciones` permite inyectar botones del panel. */
export function PartidoRow({ p, acciones, etiqueta }) {
  const gano = (lado) => p.resultado?.ganador_id && p.resultado.ganador_id === p[`pareja${lado}`]?.id;
  return (
    <div className="card py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="text-xs text-muted-foreground sm:w-44 shrink-0">
        {etiqueta && <div className="font-semibold text-foreground">{etiqueta}</div>}
        {p.fecha ? <>{fechaCorta(p.fecha)} · {p.hora} hs<br />{p.cancha}</> : 'Sin programar'}
        {p.fuera_preferencia && (
          <span className="flex items-center gap-1 text-amber-400 mt-0.5" title="Fuera del horario preferido de alguna pareja">
            <AlertTriangle className="w-3 h-3" /> fuera de preferencia
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-sm space-y-0.5">
        <div><NombrePareja par={p.pareja1} gano={gano(1)} /></div>
        <div><NombrePareja par={p.pareja2} gano={gano(2)} fallback={p.es_bye ? 'BYE' : 'A definir'} /></div>
      </div>
      <div className="text-sm font-mono sm:w-36 sm:text-right">{resultadoTxt(p)}</div>
      {acciones}
    </div>
  );
}

/**
 * Grilla de una zona: parejas numeradas + sus partidos (P1…P4 en zonas de 4)
 * con horario, cancha y resultado. Se usa en el panel y en la pantalla pública.
 */
export function ZonaGrilla({ zona, accionesDe }) {
  const parejas = [...zona.tabla].sort((a, b) => (a.numero_zona ?? 99) - (b.numero_zona ?? 99));
  const formato4 = zona.partidos.length === 4 && parejas.length === 4;
  return (
    <div className="card !p-0 overflow-hidden">
      {/* Cabecera: nombre de la zona + parejas, una por renglón (sin cortar nombres) */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold text-base">{zona.nombre}</span>
          {formato4 && <span className="text-[11px] text-muted-foreground">1v3 · 2v4 · G1vP2 · G2vP1</span>}
        </div>
        <ol className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {parejas.map(p => (
            <li key={p.pareja_id} className="flex items-start gap-2 text-sm leading-snug min-w-0">
              <span className="shrink-0 grid place-items-center w-5 h-5 mt-px rounded-full bg-muted text-[11px] font-semibold font-mono">{p.numero_zona}</span>
              <span className="break-words min-w-0">{p.numero_zona === 1 && <span className="mr-1" title="Cabeza de serie" aria-label="Cabeza de serie">🏆</span>}{p.pareja}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="divide-y divide-border">
        {zona.partidos.map(p => {
          const g = (l) => p.resultado?.ganador_id && p.resultado.ganador_id === p[`pareja${l}`]?.id;
          const res = resultadoTxt(p);
          return (
            <div key={p.id} className="px-4 py-3 space-y-2">
              {/* Línea superior: número de partido, horario/cancha y resultado */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground/80">P{p.orden}</span>
                <span className="min-w-0">{p.fecha ? <>{fechaCorta(p.fecha)} · {p.hora} hs{p.cancha && <> · {p.cancha}</>}</> : 'Sin programar'}</span>
                {res && <span className="ml-auto font-mono text-sm text-foreground">{res}</span>}
              </div>
              {/* Parejas: renglón completo para cada una, el nombre se acomoda en varias líneas si hace falta */}
              <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
                <div className="min-w-0 text-[15px] leading-snug space-y-1">
                  <div className="break-words"><NombrePareja par={p.pareja1} gano={g(1)} /></div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">vs</div>
                  <div className="break-words"><NombrePareja par={p.pareja2} gano={g(2)} /></div>
                </div>
                {accionesDe && <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 shrink-0">{accionesDe(p)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Cuadro eliminatorio en columnas (scroll horizontal en mobile). */
export function Bracket({ llave, campeonId }) {
  if (!llave?.length) return <p className="text-sm text-muted-foreground">La llave se genera al terminar la fase de zonas.</p>;
  const campeon = campeonId && llave.at(-1).partidos[0];
  const nombreCampeon = campeon && (campeon.pareja1?.id === campeonId ? campeon.pareja1 : campeon.pareja2)?.nombre;
  return (
    <div>
      {nombreCampeon && (
        <div className="card mb-4 flex items-center gap-3 border-yellow-500/40">
          <Trophy className="w-8 h-8 text-yellow-400" />
          <div><div className="text-xs text-muted-foreground">Campeones</div><div className="font-bold">{nombreCampeon}</div></div>
        </div>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {llave.map(r => (
            <div key={r.ronda} className="w-60 flex flex-col">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{RONDA_LABEL[r.ronda]}</div>
              <div className="flex flex-col justify-around flex-1 gap-3">
                {r.partidos.map(p => (
                  <div key={p.id} className="rounded-lg border border-border bg-card text-xs overflow-hidden">
                    {[1, 2].map(l => {
                      const par = p[`pareja${l}`];
                      const win = p.resultado?.ganador_id && par?.id === p.resultado.ganador_id;
                      return (
                        <div key={l} className={`px-2.5 py-1.5 flex justify-between gap-2 ${l === 2 ? 'border-t border-border' : ''} ${win ? 'text-primary font-semibold' : ''}`}>
                          <span className="truncate">{par?.nombre || (p.es_bye ? 'BYE' : '—')}</span>
                          <span className="font-mono shrink-0">
                            {(p.resultado?.sets || []).map((s, i) => {
                              const tb = p.resultado.tie_breaks?.[i];
                              return <span key={i} className="ml-1">{s[l - 1]}{tb && <sup className="text-[8px]">{tb[l - 1]}</sup>}</span>;
                            })}
                          </span>
                        </div>
                      );
                    })}
                    {!p.es_bye && p.fecha && !p.resultado && (
                      <div className="px-2.5 py-1 text-[10px] text-muted-foreground border-t border-border">
                        {fechaCorta(p.fecha)} {p.hora} · {p.cancha}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ranking por jugador. */
/**
 * Posiciones por jugador. Muestra a TODOS los inscriptos (los que no jugaron, con 0).
 * `onEditar(fila)` (solo administradores) agrega la columna Acciones → "Modificar puntaje".
 */
export function RankingJugadores({ filas, onEditar }) {
  if (!filas?.length) return <p className="text-sm text-muted-foreground">Todavía no hay jugadores inscriptos en esta categoría.</p>;
  const z = (v) => Number(v) || 0;   // nunca null / undefined / vacío
  const dif = (v) => (z(v) > 0 ? `+${z(v)}` : z(v));
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground text-left">
          <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Jugador</th><th className="px-3 py-2 hidden md:table-cell">Pareja</th>
            <th className="px-2 py-2 text-center">PJ</th><th className="px-2 py-2 text-center">PG</th><th className="px-2 py-2 text-center">PP</th>
            <th className="px-2 py-2 text-center hidden sm:table-cell" title="Diferencia de sets">DS</th><th className="px-3 py-2 text-center">Pts</th>
            {onEditar && <th className="px-2 py-2 text-right">Acciones</th>}</tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.jugador_id} className="border-t border-border">
              <td className="px-3 py-2">{f.posicion}</td>
              <td className="px-3 py-2 font-medium">{f.jugador}<div className="text-xs text-muted-foreground font-normal md:hidden">{f.pareja}</div></td>
              <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{f.pareja}</td>
              <td className="px-2 py-2 text-center">{z(f.pj)}</td><td className="px-2 py-2 text-center">{z(f.pg)}</td><td className="px-2 py-2 text-center">{z(f.pp)}</td>
              <td className="px-2 py-2 text-center hidden sm:table-cell">{dif(f.dif_sets)}</td>
              <td className="px-3 py-2 text-center font-bold text-primary whitespace-nowrap">
                {z(f.puntos)}{f.manual && <span className="ml-1 align-middle badge-yellow !text-[10px] !px-1.5 !py-0" title={`Puntaje modificado a mano (por partidos: ${z(f.puntos_calculados)})`}>manual</span>}
              </td>
              {onEditar && (
                <td className="px-2 py-2 text-right">
                  <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={() => onEditar(f)} aria-label={`Modificar puntaje de ${f.jugador}`} title="Modificar puntaje">
                    <Pencil className="w-4 h-4" /><span className="hidden lg:inline">Modificar puntaje</span>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
