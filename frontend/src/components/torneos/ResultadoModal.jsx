import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardCheck, Flag, ArrowLeft, Trophy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ModalTorneo } from './ReprogramarModal';
import { instanciaDe } from './FixtureViews';
import { errorSet, errorTieBreak, errorResultado, fechaCorta, errMsg, MAX_GAMES, MAX_TIEBREAK } from '../../utils/torneos';
import * as fmt from '../../utils/formatoPartido';

/**
 * Carga de resultado en modal (reemplaza al formulario en línea).
 *
 * - Sets 1 y 2 visibles; el 3º aparece solo si cada pareja ganó un set (y se oculta y limpia si deja de hacer falta).
 * - Casilleros de UN dígito (0–7): solo números, sin pegar, sin decimales ni negativos; avanza solo al siguiente.
 * - Tie-break (0–99) debajo del set solo cuando el set es 7-6 / 6-7.
 * - 3er set como súper tie-break (a 10) si el torneo lo usa.
 * - Victoria por W.O. → elegir ganador → confirmar (se guarda 6-0 6-0).
 * - Resumen antes de guardar. Teclado: flechas entre casilleros, Enter avanza/guarda, Escape cierra.
 * Torneo relámpago: la regla sale de la fase del partido (utils/formatoPartido): un set o dos,
 * games y tie-break configurables, súper tie-break, W.O. con el resultado mínimo de la fase.
 * El backend vuelve a validar todo (services/torneos/resultValidation).
 */
const capturar = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const vacio = () => ['', ''];
const num = (v) => (v === '' || v == null ? NaN : Number(v));

function Casilla({ value, onValue, digitos = 1, max = MAX_GAMES, label, registrar, onNav, invalida }) {
  const onKeyDown = (e) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); onNav(1); return; }
    if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); onNav(-1); return; }
    if (k === 'Backspace' && value === '') { e.preventDefault(); onNav(-1); return; }
    if (['Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Home', 'End'].includes(k) || e.ctrlKey || e.metaKey) return;
    // Solo dígitos; en games, solo 0–7 (cualquier otra tecla se bloquea: letras, "-", ".", "e"…)
    if (!/^\d$/.test(k) || (digitos === 1 && Number(k) > max)) e.preventDefault();
  };
  const onChange = (e) => {
    const limpio = e.target.value.replace(/\D/g, '');
    if (digitos === 1) {
      const d = limpio.slice(-1);
      if (d === '') { onValue(''); return; }
      if (Number(d) > max) return;
      onValue(d);
      setTimeout(() => onNav(1), 0);   // un dígito completo → siguiente casillero (tras re-renderizar: puede aparecer el tie-break)
      return;
    }
    const v = limpio.slice(0, digitos);
    if (v !== '' && Number(v) > max) return;
    onValue(v);
    if (v.length === digitos) setTimeout(() => onNav(1), 0);
  };
  return (
    <input
      ref={registrar} type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={digitos}
      className={`input !w-12 sm:!w-14 !h-12 text-center !px-0 text-xl font-semibold tabular-nums ${invalida ? '!border-red-500/70' : ''}`}
      value={value} aria-label={label}
      onKeyDown={onKeyDown} onChange={onChange}
      onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}
      onFocus={(e) => e.target.select()}
    />
  );
}

export default function ResultadoModal({ torneo, p, categoriaNombre, onSave, onClose }) {
  // Regla del partido: tradicional (6 games, TB a 7, 3er set según torneo) o la de la fase en un relámpago
  const relampago = fmt.esRelampago(torneo);
  const regla = useMemo(() => fmt.reglaPartido(torneo, p.ronda), [torneo, p.ronda]);
  const unSet = fmt.TIPOS[regla.tipo].sets === 1;
  const superTB = fmt.indiceSuperTb(regla) === 2;
  const maxG = relampago ? fmt.maxGames(regla) : MAX_GAMES;
  const digG = maxG > 9 ? 2 : 1;
  const iniciales = unSet ? 1 : 2;
  const previo = p.resultado && !p.resultado.is_walkover && p.estado !== 'walkover' ? p.resultado : null;
  const [sets, setSets] = useState(() => (previo?.sets?.length ? previo.sets.map(s => s.map(String)) : Array.from({ length: iniciales }, vacio)));
  const [tbs, setTbs] = useState(() => (previo?.sets?.length ? previo.sets.map((_, i) => (previo.tie_breaks?.[i] || vacio()).map(String)) : Array.from({ length: iniciales }, vacio)));
  // Validadores: los del relámpago usan el motor de formatos; los tradicionales, los de siempre
  const vSet = (xy, tb, nro) => (relampago ? capturar(() => fmt.validarSet(xy, tb, nro, regla)) : errorSet(xy, tb, nro));
  const vStb = (xy) => (relampago ? capturar(() => fmt.validarTieBreak(xy, regla.super_tiebreak, 'Súper tie-break')) : errorTieBreak(xy, 10, 'Súper tie-break'));
  const vResultado = (ss, tt) => (relampago ? capturar(() => fmt.validarResultado(ss, tt, regla)) : errorResultado(ss, tt, torneo.tercer_set));
  const [modo, setModo] = useState('carga');          // carga | wo | confirmar
  const [woGanador, setWoGanador] = useState(null);   // 1 | 2
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const refs = useRef(new Map());
  const set3Ref = useRef(null);
  const nombre = (l) => p[`pareja${l}`]?.nombre || (l === 1 ? 'Pareja A' : 'Pareja B');

  const esTb = (i) => !(i === 2 && superTB) && sets[i] && (relampago
    ? sets[i].every(v => v !== '') && fmt.esSetConTb(sets[i].map(num), regla)
    : Math.max(num(sets[i][0]), num(sets[i][1])) === 7 && Math.min(num(sets[i][0]), num(sets[i][1])) === 6);
  const completo = (i) => sets[i]?.every(v => v !== '');
  const ganadorSet = (i) => {
    if (!completo(i)) return null;
    const [x, y] = sets[i].map(num);
    const e = i === 2 && superTB ? vStb([x, y]) : vSet([x, y], esTb(i) ? tbs[i].map(num) : null, i + 1);
    if (e && !(esTb(i) && tbs[i].some(v => v === ''))) return null;   // set inválido
    return x > y ? 1 : 2;
  };
  const g1 = ganadorSet(0), g2 = ganadorSet(1);
  const necesitaTercero = !unSet && Boolean(g1 && g2 && g1 !== g2);

  // 3er set automático: aparece si van 1-1 y desaparece (limpio) si deja de hacer falta
  useEffect(() => {
    if (necesitaTercero && sets.length === 2) {
      setSets(s => [...s, vacio()]); setTbs(t => [...t, vacio()]);
      setTimeout(() => { set3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); refs.current.get('s2-0')?.focus(); }, 50);
    } else if (!necesitaTercero && sets.length === 3) {
      setSets(s => s.slice(0, 2)); setTbs(t => t.slice(0, 2));
    }
  }, [necesitaTercero, sets.length]);

  // Orden de los casilleros visibles (flechas / auto-avance)
  const orden = useMemo(() => sets.flatMap((_, i) => [`s${i}-0`, `s${i}-1`, ...(esTb(i) ? [`t${i}-0`, `t${i}-1`] : [])]), [sets, tbs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ordenRef = useRef(orden);
  ordenRef.current = orden;
  const nav = (clave) => (paso) => {
    const o = ordenRef.current;   // orden vigente al momento de navegar
    const i = o.indexOf(clave) + paso;
    const el = refs.current.get(o[i]);
    if (el) el.focus();
  };
  const registrar = (clave) => (el) => { if (el) refs.current.set(clave, el); else refs.current.delete(clave); };
  useEffect(() => { if (modo === 'carga') setTimeout(() => refs.current.get('s0-0')?.focus(), 30); }, [modo]);

  const cambiarSet = (i, l, v) => { setError(''); setSets(ss => ss.map((s, j) => (j === i ? s.map((x, k) => (k === l ? v : x)) : s))); };
  const cambiarTb = (i, l, v) => { setError(''); setTbs(ts => ts.map((t, j) => (j === i ? t.map((x, k) => (k === l ? v : x)) : t))); };

  // Validación en vivo
  const setsN = sets.map(s => s.map(num));
  const tbsN = tbs.map((t, i) => (esTb(i) ? t.map(num) : null));
  const todoCompleto = sets.every((_, i) => completo(i)) && tbs.every((t, i) => !esTb(i) || t.every(v => v !== ''));
  const errorDeSet = (i) => {
    if (!completo(i) || (esTb(i) && tbs[i].some(v => v === ''))) return null;
    return i === 2 && superTB ? vStb(setsN[i]) : vSet(setsN[i], tbsN[i], i + 1);
  };
  const errorGeneral = todoCompleto ? vResultado(setsN, tbsN) : null;

  const textoSets = (ss, tb) => ss.map(([a, b], i) => `${a}-${b}${tb?.[i] ? ` (TB ${tb[i][0]}-${tb[i][1]})` : ''}`).join(' / ');
  const continuar = () => {
    if (!todoCompleto) { setError('Completá todos los casilleros.'); return; }
    if (errorGeneral) { setError(errorGeneral); return; }
    const ganador = setsN.filter(([a, b]) => a > b).length > setsN.filter(([a, b]) => b > a).length ? 1 : 2;
    setPayload({ datos: { sets: setsN, tie_breaks: tbsN }, ganador, texto: textoSets(setsN, tbsN) });
    setModo('confirmar');
  };
  const confirmarWo = () => {
    if (!woGanador) { setError('Elegí quién gana por W.O.'); return; }
    const ss = relampago ? fmt.setsWalkover(woGanador, regla) : [woGanador === 1 ? [6, 0] : [0, 6], woGanador === 1 ? [6, 0] : [0, 6]];
    setPayload({ datos: { walkover_ganador: woGanador }, ganador: woGanador, texto: `W.O. ${ss.map(x => x.join('-')).join(' ')}`, wo: true });
    setModo('confirmar');
  };
  const guardar = async () => {
    setEnviando(true); setError('');
    try { await onSave(payload.datos); } catch (e) { setError(errMsg(e)); setModo(payload.wo ? 'wo' : 'carga'); } finally { setEnviando(false); }
  };
  const onKeyDownForm = (e) => {
    if (e.key !== 'Enter' || enviando) return;
    e.preventDefault();
    if (modo === 'carga') continuar();
    else if (modo === 'wo') confirmarWo();
    else guardar();
  };

  const instancia = instanciaDe(p);
  return (
    <ModalTorneo titulo={p.resultado ? 'Corregir resultado' : 'Cargar resultado'} icon={ClipboardCheck} onClose={onClose} ancho="sm:max-w-xl">
      <div className="space-y-4" onKeyDown={onKeyDownForm}>
        {/* Datos del partido */}
        <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1">
          <div className="text-xs text-muted-foreground">{torneo.nombre}{categoriaNombre && ` · ${categoriaNombre}`} · {instancia}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="font-semibold leading-snug"><span className="text-[10px] font-bold text-primary mr-1">A</span>{nombre(1)}</div>
            <span className="text-xs text-muted-foreground">vs</span>
            <div className="font-semibold leading-snug text-right">{nombre(2)}<span className="text-[10px] font-bold text-primary ml-1">B</span></div>
          </div>
          {p.fecha && <div className="text-xs text-muted-foreground">{fechaCorta(p.fecha)} · {p.hora} hs{p.cancha && ` · ${p.cancha}`}</div>}
        </div>

        {modo === 'carga' && (
          <>
            <div className="space-y-3">
              {sets.map((s, i) => {
                const err = errorDeSet(i);
                const g = !err && completo(i) && (!esTb(i) || tbs[i].every(v => v !== '')) ? (num(s[0]) > num(s[1]) ? 1 : 2) : null;
                const stb = i === 2 && superTB;
                return (
                  <div key={i} ref={i === 2 ? set3Ref : undefined} className={`rounded-xl border px-3 py-3 ${i === 2 ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-20 shrink-0">
                        <div className="text-sm font-semibold">{stb ? 'Súper TB' : unSet ? 'Set único' : `Set ${i + 1}`}</div>
                        {g && <div className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> gana {g === 1 ? 'A' : 'B'}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground">A</span>
                        <Casilla value={s[0]} onValue={v => cambiarSet(i, 0, v)} digitos={stb ? 2 : digG} max={stb ? MAX_TIEBREAK : maxG} label={`${stb ? 'Súper tie-break' : `Set ${i + 1}`} pareja A`} registrar={registrar(`s${i}-0`)} onNav={nav(`s${i}-0`)} invalida={Boolean(err)} />
                        <span className="text-muted-foreground">–</span>
                        <Casilla value={s[1]} onValue={v => cambiarSet(i, 1, v)} digitos={stb ? 2 : digG} max={stb ? MAX_TIEBREAK : maxG} label={`${stb ? 'Súper tie-break' : `Set ${i + 1}`} pareja B`} registrar={registrar(`s${i}-1`)} onNav={nav(`s${i}-1`)} invalida={Boolean(err)} />
                        <span className="text-[10px] font-bold text-muted-foreground">B</span>
                      </div>
                    </div>
                    {esTb(i) && (
                      <div className="mt-3 pt-3 border-t border-dashed border-border flex flex-wrap items-center gap-3">
                        <div className="w-20 shrink-0 text-xs font-medium text-amber-400">Tie-break</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground">A</span>
                          <Casilla value={tbs[i][0]} onValue={v => cambiarTb(i, 0, v)} digitos={2} max={MAX_TIEBREAK} label={`Tie-break set ${i + 1} pareja A`} registrar={registrar(`t${i}-0`)} onNav={nav(`t${i}-0`)} invalida={Boolean(err)} />
                          <span className="text-muted-foreground">–</span>
                          <Casilla value={tbs[i][1]} onValue={v => cambiarTb(i, 1, v)} digitos={2} max={MAX_TIEBREAK} label={`Tie-break set ${i + 1} pareja B`} registrar={registrar(`t${i}-1`)} onNav={nav(`t${i}-1`)} invalida={Boolean(err)} />
                          <span className="text-[10px] font-bold text-muted-foreground">B</span>
                        </div>
                      </div>
                    )}
                    {err && <p className="mt-2 text-xs text-red-400 flex items-center gap-1" role="alert"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{err}</p>}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {relampago ? (
                <>
                  <span className="font-semibold text-amber-400">Relámpago · {fmt.describirRegla(regla)}.</span>{' '}
                  Sets a {regla.games}: {fmt.ayudaSet(regla)}{superTB && `. Si van 1 set a 1, súper tie-break a ${regla.super_tiebreak}`}{regla.tipo === 'mejor_de_3' && '. El 3º aparece solo si van 1 set a 1'}.
                </>
              ) : (<>
              Games de 0 a 7: 6-0 a 6-4, 7-5 o 7-6 (con tie-break a 7 y 2 de diferencia, ej. 7-4, 10-8). El 3º aparece solo si van 1 set a 1.
              {superTB && ' En este torneo el 3º es súper tie-break a 10 (ej. 10-8).'}
              </>)}
            </p>
            {(error || (todoCompleto && errorGeneral && !sets.some((_, i) => errorDeSet(i)))) && <p className="text-sm text-red-400" role="alert">{error || errorGeneral}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-outline text-sm !text-amber-400 !border-amber-500/40" onClick={() => { setError(''); setModo('wo'); }}><Flag className="w-4 h-4" /> Victoria por W.O.</button>
              <span className="flex-1" />
              <button type="button" className="btn-ghost text-sm" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn-primary text-sm" disabled={!todoCompleto || Boolean(errorGeneral)} onClick={continuar}>Continuar</button>
            </div>
          </>
        )}

        {modo === 'wo' && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">Victoria por W.O. · ¿quién gana?</div>
            <div className="space-y-2" role="radiogroup" aria-label="Ganador por W.O.">
              {[1, 2].map(l => (
                <label key={l} className={`flex items-center gap-3 rounded-xl border px-3 py-3 cursor-pointer ${woGanador === l ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                  <input type="radio" name="wo" checked={woGanador === l} onChange={() => { setWoGanador(l); setError(''); }} autoFocus={l === 1} />
                  <span className="text-[10px] font-bold text-primary">{l === 1 ? 'A' : 'B'}</span>
                  <span className="font-medium">{nombre(l)}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Se registra como {(relampago ? fmt.setsWalkover(woGanador || 1, regla) : [[6, 0], [6, 0]]).map(x => (woGanador === 2 && !relampago ? [...x].reverse() : x).join('-')).join(' ')} a favor del ganador, con la marca "W.O.". La pareja que no se presentó no suma puntos en la zona.</p>
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => { setModo('carga'); setError(''); }}><ArrowLeft className="w-4 h-4" /> Volver</button>
              <button type="button" className="btn-primary text-sm" disabled={!woGanador} onClick={confirmarWo}>Continuar</button>
            </div>
          </div>
        )}

        {modo === 'confirmar' && payload && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Ganador</div>
                <div className="font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-400" />{nombre(payload.ganador)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Resultado</div>
                <div className="font-mono text-lg flex items-center gap-2">
                  {payload.wo && <span className="badge badge-yellow font-sans !text-xs">W.O.</span>}
                  {payload.wo ? payload.texto.replace('W.O. ', '') : payload.texto}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Al guardar se recalculan las posiciones de la zona, se actualiza la llave y, si corresponde, el ranking.</p>
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost text-sm" disabled={enviando} onClick={() => setModo(payload.wo ? 'wo' : 'carga')}><ArrowLeft className="w-4 h-4" /> Corregir</button>
              <button type="button" className="btn-primary text-sm" disabled={enviando} onClick={guardar} autoFocus>{enviando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            </div>
          </div>
        )}
      </div>
    </ModalTorneo>
  );
}
