import { Trophy, AlertTriangle } from 'lucide-react';
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
                  {r.numero_zona && <span className="text-[10px] text-muted-foreground mr-1.5 font-mono">#{r.numero_zona}</span>}
                  {r.pareja}
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
      {par.numero_zona && <span className="text-[10px] text-muted-foreground mr-1 font-mono">#{par.numero_zona}</span>}
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
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold">{zona.nombre}</span>
        <span className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
          {parejas.map(p => <span key={p.pareja_id}><span className="font-mono">#{p.numero_zona}</span> {p.pareja}</span>)}
        </span>
        {formato4 && <span className="text-[10px] text-muted-foreground ml-auto">1v3 · 2v4 · G1vP2 · G2vP1</span>}
      </div>
      <div className="divide-y divide-border">
        {zona.partidos.map(p => {
          const g = (l) => p.resultado?.ganador_id && p.resultado.ganador_id === p[`pareja${l}`]?.id;
          return (
            <div key={p.id} className="px-4 py-2.5 grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_9rem_8rem_auto] gap-x-3 gap-y-1 items-center text-sm">
              <span className="font-mono text-xs text-muted-foreground">P{p.orden}</span>
              <div className="min-w-0 space-y-0.5">
                <div className="truncate"><NombrePareja par={p.pareja1} gano={g(1)} /></div>
                <div className="truncate"><NombrePareja par={p.pareja2} gano={g(2)} /></div>
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground">
                {p.fecha ? <>{fechaCorta(p.fecha)} {p.hora}<br />{p.cancha}</> : 'Sin programar'}
              </div>
              <div className="font-mono text-sm sm:text-right">{resultadoTxt(p) || <span className="text-muted-foreground text-xs">—</span>}</div>
              {accionesDe && <div className="col-span-3 sm:col-span-1 flex justify-end">{accionesDe(p)}</div>}
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
export function RankingJugadores({ filas }) {
  if (!filas?.length) return <p className="text-sm text-muted-foreground">Sin partidos jugados todavía.</p>;
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground text-left">
          <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Jugador</th><th className="px-3 py-2">Pareja</th>
            <th className="px-2 py-2 text-center">PJ</th><th className="px-2 py-2 text-center">PG</th><th className="px-3 py-2 text-center">Pts</th></tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.jugador_id} className="border-t border-border">
              <td className="px-3 py-2">{f.posicion}</td><td className="px-3 py-2 font-medium">{f.jugador}</td>
              <td className="px-3 py-2 text-muted-foreground">{f.pareja}</td>
              <td className="px-2 py-2 text-center">{f.pj}</td><td className="px-2 py-2 text-center">{f.pg}</td>
              <td className="px-3 py-2 text-center font-bold text-primary">{f.puntos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
