import { Trophy, AlertTriangle } from 'lucide-react';
import { RONDA_LABEL, fechaCorta, setsTxt } from '../../utils/torneos';

/** Tabla de posiciones de una zona. */
export function TablaZona({ zona }) {
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
              <th className="px-3 py-2">#</th><th className="px-3 py-2">Pareja</th>
              <th className="px-2 py-2 text-center">PJ</th><th className="px-2 py-2 text-center">PG</th>
              <th className="px-2 py-2 text-center">PP</th><th className="px-2 py-2 text-center">Sets</th>
              <th className="px-2 py-2 text-center">Games</th><th className="px-3 py-2 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {zona.tabla.map(r => (
              <tr key={r.pareja_id} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.posicion}</td>
                <td className="px-3 py-2 min-w-[160px]">{r.pareja}</td>
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

/** Línea de partido (fixture). `acciones` permite inyectar botones del panel. */
export function PartidoRow({ p, acciones }) {
  const gano = (lado) => p.resultado?.ganador_id && p.resultado.ganador_id === p[`pareja${lado}`]?.id;
  return (
    <div className="card py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="text-xs text-muted-foreground sm:w-44 shrink-0">
        {p.fecha ? <>{fechaCorta(p.fecha)} · {p.hora} hs<br />{p.cancha}</> : 'Sin programar'}
        {p.fuera_preferencia && (
          <span className="flex items-center gap-1 text-amber-400 mt-0.5" title="Fuera del horario preferido de alguna pareja">
            <AlertTriangle className="w-3 h-3" /> fuera de preferencia
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className={gano(1) ? 'font-semibold text-primary' : ''}>{p.pareja1?.nombre || 'A definir'}</div>
        <div className={gano(2) ? 'font-semibold text-primary' : ''}>{p.pareja2?.nombre || (p.es_bye ? 'BYE' : 'A definir')}</div>
      </div>
      <div className="text-sm font-mono sm:w-32 sm:text-right">
        {p.estado === 'walkover' && !p.es_bye ? 'W.O.' : setsTxt(p.resultado?.sets)}
      </div>
      {acciones}
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
            <div key={r.ronda} className="w-56 flex flex-col">
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
                          <span className="font-mono shrink-0">{(p.resultado?.sets || []).map(s => s[l - 1]).join(' ')}</span>
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
