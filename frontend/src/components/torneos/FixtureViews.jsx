import { Trophy, AlertTriangle, Pencil } from 'lucide-react';
import { RONDA_LABEL, fechaCorta, setsTxt } from '../../utils/torneos';
import { UltimaModificacion } from './ReprogramarModal';

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

export const resultadoTxt = (p) => (p.estado === 'walkover' && !p.es_bye ? 'W.O.' : setsTxt(p.resultado?.sets, p.resultado?.tie_breaks));

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
        <UltimaModificacion p={p} />
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
              <UltimaModificacion p={p} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cronograma: partidos por día, horario y cancha ────────────
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
/** Etiqueta del partido: "Zona A · P2" o la ronda de la llave. */
export const instanciaDe = (p) => (p.ronda === 'zona' ? `${p.zona || 'Zona'} · P${p.orden}` : (RONDA_LABEL[p.ronda] || p.ronda));
const nombreDe = (par, p, fallback = 'A definir') => par?.nombre || (p.es_bye ? 'BYE' : fallback);

/**
 * Agrupa los partidos por día (ascendente) y dentro de cada día los ordena por
 * horario y luego por cancha. Los partidos sin programar van al final.
 */
export function agruparPorDia(partidos) {
  const lista = partidos.filter(p => !p.es_bye);
  const programados = lista.filter(p => p.fecha && p.hora)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || String(a.cancha || '').localeCompare(String(b.cancha || ''), 'es', { numeric: true }));
  const dias = [];
  for (const p of programados) {
    const d = dias.at(-1);
    if (d?.fecha === p.fecha) d.partidos.push(p); else dias.push({ fecha: p.fecha, partidos: [p] });
  }
  const sinProgramar = lista.filter(p => !p.fecha || !p.hora);
  return { dias, sinProgramar };
}

/** Listado de partidos por día → horario → cancha (pantalla Partidos y página pública). */
export function Cronograma({ partidos, accionesDe }) {
  const { dias, sinProgramar } = agruparPorDia(partidos);
  if (!dias.length && !sinProgramar.length) return <p className="text-sm text-muted-foreground">Todavía no hay partidos.</p>;
  const fila = (p) => {
    const g = (l) => p.resultado?.ganador_id && p.resultado.ganador_id === p[`pareja${l}`]?.id;
    const res = resultadoTxt(p);
    return (
      <li key={p.id} className="px-4 py-3 grid grid-cols-[4.5rem_1fr] sm:grid-cols-[4.5rem_9rem_1fr_auto] gap-x-3 gap-y-1 items-start">
        <div className="font-mono font-semibold text-base leading-tight">{p.hora || '—'}<span className="block sm:hidden text-[11px] font-sans font-normal text-muted-foreground">{p.cancha || 'Sin cancha'}</span></div>
        <div className="hidden sm:block text-sm text-muted-foreground leading-snug">{p.cancha || 'Sin cancha'}</div>
        <div className="min-w-0 space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{instanciaDe(p)}</div>
          <div className="text-[15px] leading-snug break-words"><span className={g(1) ? 'font-semibold text-primary' : ''}>{nombreDe(p.pareja1, p)}</span> <span className="text-muted-foreground text-xs">vs</span> <span className={g(2) ? 'font-semibold text-primary' : ''}>{nombreDe(p.pareja2, p)}</span></div>
          {res && <div className="font-mono text-sm sm:hidden">{res}</div>}
          <UltimaModificacion p={p} />
        </div>
        <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2">
          {res && <span className="hidden sm:inline font-mono text-sm">{res}</span>}
          {accionesDe?.(p)}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      {dias.map(d => (
        <section key={d.fecha} className="card !p-0 overflow-hidden">
          <h4 className="px-4 py-2.5 border-b border-border font-semibold capitalize bg-muted/40">{fechaLarga(d.fecha)} <span className="text-xs font-normal text-muted-foreground normal-case">· {d.partidos.length} partido(s)</span></h4>
          <ul className="divide-y divide-border">{d.partidos.map(fila)}</ul>
        </section>
      ))}
      {sinProgramar.length > 0 && (
        <section className="card !p-0 overflow-hidden">
          <h4 className="px-4 py-2.5 border-b border-border font-semibold text-amber-400">Sin programar · {sinProgramar.length}</h4>
          <ul className="divide-y divide-border">{sinProgramar.map(fila)}</ul>
        </section>
      )}
    </div>
  );
}

/**
 * PDF del fixture: abre una página imprimible (Guardar como PDF) con los partidos
 * por zona (parejas + partidos) y por día → horario → cancha, como en la pantalla.
 */
export function imprimirFixture({ torneo, fx, categoria }) {
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const llave = (fx.llave || []).flatMap(r => r.partidos).filter(p => !p.es_bye);
  const todos = [...fx.zonas.flatMap(z => z.partidos), ...llave];
  const { dias, sinProgramar } = agruparPorDia(todos);
  const vs = (p) => `${e(nombreDe(p.pareja1, p))} <span class="vs">vs</span> ${e(nombreDe(p.pareja2, p))}`;
  const cuando = (p) => (p.fecha ? `${e(fechaCorta(p.fecha))} · ${e(p.hora)} hs${p.cancha ? ` · ${e(p.cancha)}` : ''}` : 'Sin programar');
  const zonasHtml = fx.zonas.map(z => {
    const parejas = [...z.tabla].sort((a, b) => (a.numero_zona ?? 99) - (b.numero_zona ?? 99));
    return `<div class="zona"><h3>${e(z.nombre)}</h3>
      <ol class="parejas">${parejas.map(p => `<li><b>${e(p.numero_zona)}.</b> ${p.numero_zona === 1 ? '🏆 ' : ''}${e(p.pareja)}</li>`).join('')}</ol>
      <table><thead><tr><th>#</th><th>Partido</th><th>Día · hora · cancha</th><th>Resultado</th></tr></thead><tbody>
      ${z.partidos.map(p => `<tr><td>P${e(p.orden)}</td><td>${vs(p)}</td><td>${cuando(p)}</td><td class="mono">${e(resultadoTxt(p) || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }).join('');
  const tablaDia = (lista) => `<table><thead><tr><th>Hora</th><th>Cancha</th><th>Instancia</th><th>Partido</th><th>Resultado</th></tr></thead><tbody>
    ${lista.map(p => `<tr><td class="mono">${e(p.hora || '—')}</td><td>${e(p.cancha || '—')}</td><td>${e(instanciaDe(p))}</td><td>${vs(p)}</td><td class="mono">${e(resultadoTxt(p) || '')}</td></tr>`).join('')}
    </tbody></table>`;
  const diasHtml = dias.map(d => `<div class="dia"><h3>${e(fechaLarga(d.fecha))}</h3>${tablaDia(d.partidos)}</div>`).join('')
    + (sinProgramar.length ? `<div class="dia"><h3>Sin programar</h3>${tablaDia(sinProgramar)}</div>` : '');
  const titulo = `${torneo.nombre}${categoria ? ` · ${categoria}` : ''}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fixture · ${e(titulo)}</title>
<style>
  *{box-sizing:border-box} body{font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:20px}
  h1{font-size:18px;margin:0} .sub{color:#555;margin:2px 0 16px} h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #111;padding-bottom:3px}
  h3{font-size:13px;margin:0 0 6px;text-transform:capitalize} .zona,.dia{break-inside:avoid;margin-bottom:14px}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top} th{background:#f2f2f2;font-size:11px}
  .parejas{margin:0 0 6px;padding:0;list-style:none;columns:2;column-gap:16px} .parejas li{margin:1px 0}
  .vs{color:#888;font-size:10px} .mono{font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
  .pagina{break-before:page} button{float:right;padding:6px 12px} @media print{button{display:none} body{margin:10mm}}
</style></head><body>
<button onclick="print()">Imprimir / Guardar PDF</button>
<h1>${e(titulo)}</h1>
<p class="sub">${e(fechaCorta(torneo.fecha_inicio))} → ${e(fechaCorta(torneo.fecha_fin))} · ${todos.length} partidos · generado ${e(new Date().toLocaleString('es-AR'))}</p>
<h2>Partidos por zona</h2>${zonasHtml || '<p>Sin zonas.</p>'}
${llave.length ? `<h3>Llave</h3><table><thead><tr><th>Instancia</th><th>Partido</th><th>Día · hora · cancha</th><th>Resultado</th></tr></thead><tbody>${llave.map(p => `<tr><td>${e(instanciaDe(p))}</td><td>${vs(p)}</td><td>${cuando(p)}</td><td class="mono">${e(resultadoTxt(p) || '')}</td></tr>`).join('')}</tbody></table>` : ''}
<h2 class="pagina">Partidos por día y horario</h2>${diasHtml || '<p>Sin partidos programados.</p>'}
<script>setTimeout(function(){print()},300)</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Permití las ventanas emergentes para generar el PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/** Cuadro de referencia: mismos cruces que la llave real; cada lugar se completa con la pareja al terminar su zona. */
function BracketReferencia({ prevista }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">Llave de referencia</strong> · {prevista.clasificados} clasificados de {prevista.zonas} zonas{prevista.estimada ? ' (estimadas con las parejas inscriptas)' : ''}
        {' '}→ empieza en <strong className="text-foreground">{RONDA_LABEL[prevista.ronda]}</strong>{prevista.byes ? ` · ${prevista.byes} BYE para los primeros de zona` : ''}.
        Al terminar cada zona su lugar se reemplaza por la pareja que quedó en esa posición.
        {prevista.simulada ? ' Los horarios son una simulación según la disponibilidad de canchas y las demás categorías.' : ' Cargá el inicio de la llave para simular los horarios.'}
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {prevista.rondas.map(r => (
            <div key={r.ronda} className="w-60 flex flex-col">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{RONDA_LABEL[r.ronda]}</div>
              <div className="flex flex-col justify-around flex-1 gap-3">
                {r.partidos.map(p => (
                  <div key={p.id} className="rounded-lg border border-dashed border-border bg-card text-xs overflow-hidden">
                    {[1, 2].map(l => {
                      const par = p[`pareja${l}`];
                      return (
                        <div key={l} className={`px-2.5 py-1.5 ${l === 2 ? 'border-t border-dashed border-border' : ''}`}>
                          {par
                            ? <span className={par.pendiente ? 'italic text-muted-foreground' : 'font-medium'} title={par.referencia && !par.pendiente ? par.referencia : undefined}>{par.nombre}{!par.pendiente && par.referencia && <span className="ml-1 text-[10px] text-muted-foreground not-italic">({par.referencia})</span>}</span>
                            : <span className="italic text-muted-foreground">BYE</span>}
                        </div>
                      );
                    })}
                    {!p.es_bye && (p.fecha || p.sin_lugar) && (
                      <div className={`px-2.5 py-1 text-[10px] border-t border-dashed border-border ${p.sin_lugar ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {p.sin_lugar ? 'Sin cancha libre: ampliá las franjas o reprogramá' : <>🕒 {fechaCorta(p.fecha)} · {p.hora} hs · {p.cancha}</>}
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

/** Cuadro eliminatorio en columnas (scroll horizontal en mobile). */
export function Bracket({ llave, campeonId, prevista }) {
  // Sin llave generada: cuadro de referencia por zonas ("1° Zona A vs 2° Zona D")
  if (!llave?.length && prevista?.rondas?.length) return <BracketReferencia prevista={prevista} />;
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
