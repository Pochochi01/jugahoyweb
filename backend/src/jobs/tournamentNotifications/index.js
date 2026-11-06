'use strict';
/**
 * jobs/tournamentNotifications — Motor de eventos de torneos → notificaciones push.
 *
 * Los eventos se DERIVAN del estado persistido (partidos jugados, zonas completas, torneos
 * finalizados, inscripciones impagas, partidos próximos): no se toca la lógica de torneos.
 * Cada evento tiene una clave de deduplicación (tipo + entidad + DNI) con índice único:
 * correr un job dos veces, o en dos procesos, nunca duplica un mensaje.
 *
 * Jobs (scheduler con setInterval, igual que el resto de schedulers del backend):
 *   matchReminderJob               cada 1 min   partido a 3 h
 *   paymentReminderJob             cada 30 min  inscripción impaga: 7 d / 3 d / 24 h antes del cierre
 *   resultNotificationJob          cada 1 min   ganador / perdedor, avanza en llave, semifinal
 *   classificationNotificationJob  cada 2 min   clasificados de zona
 *   finalNotificationJob           cada 2 min   campeón / subcampeón / torneo finalizado
 *   queue                          cada 15 s    procesa la cola de envío (reintentos incluidos)
 */
const { Op } = require('sequelize');
const m = require('../../models');
const svc = require('../../services/notifications/NotificationService');

const { Torneo, TorneoPartido, TorneoPareja, TorneoJugador, TorneoResultado, TorneoZona, TorneoTablaPosicion, Field, Complex, PadelJugador } = m;

const TZ = '-03:00';                     // Argentina (sin horario de verano)
const VENTANA_EVENTOS_H = 48;            // se miran cambios de las últimas 48 h
const PAREJAS_ACTIVAS = ['pendiente', 'pagado'];
// Jugadores con su DNI; si la inscripción no lo tiene, se toma el de su ficha (padel_jugadores)
const JUGADORES = () => ({ model: TorneoJugador, as: 'jugadores', attributes: ['id', 'nombre', 'dni', 'jugador_id'], include: [{ model: PadelJugador, as: 'registro', attributes: ['dni'], required: false }] });
const conJugadores = (as) => ({ model: TorneoPareja, as, include: [JUGADORES()] });
const inicioPartido = (p) => new Date(`${p.fecha}T${String(p.hora).slice(0, 5)}:00${TZ}`);
const hace = (h) => new Date(Date.now() - h * 3600 * 1000);

async function torneosPorId(ids) {
  if (!ids.length) return new Map();
  const ts = await Torneo.findAll({ where: { id: [...new Set(ids)] }, attributes: ['id', 'id_tenant', 'nombre', 'estado', 'fecha_inicio', 'precio_inscripcion', 'clasifican_por_zona', 'parejas_por_zona'], raw: true });
  return new Map(ts.map(t => [t.id, t]));
}
const dniDe = (j) => String(j.dni || j.registro?.dni || '').replace(/\D/g, '');
const destinatarios = (pareja, extra = {}) => (pareja?.jugadores || []).filter(j => dniDe(j)).map(j => ({ dni: dniDe(j), nombre: j.nombre, pareja_id: pareja.id, ...extra }));

// ── 1. Recordatorio de partido (3 h antes) ────────────────────
async function matchReminderJob(ahora = new Date()) {
  const desde = new Date(ahora.getTime() + (3 * 60 - 10) * 60000);   // tolera hasta 10 min de atraso del job
  const hasta = new Date(ahora.getTime() + 3 * 3600000);
  const fechas = [...new Set([desde, hasta].map(d => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)))];
  const partidos = await TorneoPartido.findAll({
    where: { estado: 'programado', es_bye: false, fecha: fechas, hora: { [Op.ne]: null } },
    include: [conJugadores('pareja1'), conJugadores('pareja2'), { model: Field, as: 'field', attributes: ['nombre', 'identificador'] }],
  });
  const proximos = partidos.filter(p => { const t = inicioPartido(p); return t > desde && t <= hasta; });
  if (!proximos.length) return 0;
  const torneos = await torneosPorId(proximos.map(p => p.torneo_id));
  const clubes = new Map((await Complex.findAll({ where: { id: [...new Set([...torneos.values()].map(t => t.id_tenant))] }, attributes: ['id', 'nombre'], raw: true })).map(c => [c.id, c]));
  let n = 0;
  for (const p of proximos) {
    const t = torneos.get(p.torneo_id);
    if (!t || !['zonas', 'llaves'].includes(t.estado)) continue;
    const cancha = p.field ? `${p.field.nombre}${p.field.identificador ? ` (${p.field.identificador})` : ''}` : null;
    const ctx = { hora: String(p.hora).slice(0, 5), sede: [clubes.get(t.id_tenant)?.nombre, cancha].filter(Boolean).join(' · ') || 'a confirmar' };
    const dest = [p.pareja1, p.pareja2].flatMap(par => destinatarios(par, { partido_id: p.id }))
      .map(d => ({ ...d, dedupe: `rec_partido:${p.id}:${p.fecha}${String(p.hora).slice(0, 5)}:${d.dni}` }));
    n += (await svc.sendMatchReminder(t, dest, ctx)).encoladas;
  }
  return n;
}

// ── 2. Recordatorio de pago (7 d, 3 d, 24 h antes del cierre) ─
const UMBRALES_H = [24, 72, 168];
async function paymentReminderJob(ahora = new Date()) {
  const torneos = await Torneo.findAll({
    where: { estado: 'inscripcion', precio_inscripcion: { [Op.gt]: 0 }, fecha_inicio: { [Op.gte]: ahora.toISOString().slice(0, 10) } },
    attributes: ['id', 'id_tenant', 'nombre', 'estado', 'fecha_inicio'], raw: true,
  });
  let n = 0;
  for (const t of torneos) {
    // Cierre de inscripción = inicio del torneo (00:00 hora argentina)
    const faltanH = (new Date(`${t.fecha_inicio}T00:00:00${TZ}`) - ahora) / 3600000;
    if (faltanH <= 0) continue;
    const umbral = UMBRALES_H.find(u => faltanH <= u);   // el más cercano que ya se alcanzó
    if (!umbral) continue;
    const parejas = await TorneoPareja.findAll({ where: { torneo_id: t.id, estado_pago: 'pendiente' }, include: [JUGADORES()] });
    const dest = parejas.flatMap(p => destinatarios(p)).map(d => ({ ...d, dedupe: `rec_pago:${d.pareja_id}:${umbral}h:${d.dni}` }));
    n += (await svc.sendPaymentReminder(t, dest)).encoladas;
  }
  return n;
}

// ── Partidos con resultado (base de los jobs 3 y 5) ───────────
async function partidosConResultado(rondas, desde) {
  return TorneoPartido.findAll({
    where: { estado: ['jugado', 'walkover'], es_bye: false, ronda: rondas, updated_at: { [Op.gte]: desde } },
    include: [conJugadores('pareja1'), conJugadores('pareja2'), { model: TorneoResultado, as: 'resultado', required: true, attributes: ['id', 'ganador_id'] }],
  });
}
const ganadorYPerdedor = (p) => {
  const g = p.resultado?.ganador_id;
  if (!g) return [null, null];
  return g === p.pareja1_id ? [p.pareja1, p.pareja2] : [p.pareja2, p.pareja1];
};
// Por ronda, qué recibe cada lado (un solo mensaje por jugador y partido)
const POR_RONDA = {
  zona: ['resultado_ganador', 'resultado_perdedor'],
  '16avos': ['avanza_llave', 'resultado_perdedor'],
  octavos: ['avanza_llave', 'resultado_perdedor'],
  cuartos: ['avanza_llave', 'resultado_perdedor'],
  semifinal: ['finalista', 'eliminado_semifinal'],
  final: ['campeon', 'subcampeon'],
};
async function notificarResultados(rondas, desde) {
  const partidos = await partidosConResultado(rondas, desde);
  if (!partidos.length) return 0;
  const torneos = await torneosPorId(partidos.map(p => p.torneo_id));
  let n = 0;
  for (const p of partidos) {
    const t = torneos.get(p.torneo_id);
    const [g, l] = ganadorYPerdedor(p);
    if (!t || !g) continue;
    const [tg, tl] = POR_RONDA[p.ronda];
    // La clave incluye el resultado: si se borra y se vuelve a cargar (o cambia el ganador) es un aviso nuevo
    const res = `r${p.resultado.id}g${p.resultado.ganador_id}`;
    const lado = (par, tipo) => destinatarios(par, { partido_id: p.id }).map(d => ({ ...d, tipo, torneo: t, dedupe: `${tipo}:${p.id}:${res}:${d.dni}` }));
    const items = [...lado(g, tg), ...lado(l, tl)];
    if (p.ronda === 'final') {   // métodos específicos de campeón / subcampeón
      n += (await svc.sendChampionNotification(t, items.filter(i => i.tipo === 'campeon'))).encoladas;
      n += (await svc.sendRunnerUpNotification(t, items.filter(i => i.tipo === 'subcampeon'))).encoladas;
    } else n += (await svc.encolar(items)).encoladas;
  }
  return n;
}

// ── 3. Resultado de partido (zonas, octavos, cuartos, semifinal) ─
const resultNotificationJob = () => notificarResultados(['zona', '16avos', 'octavos', 'cuartos', 'semifinal'], hace(VENTANA_EVENTOS_H));

// ── 4. Clasificación de zona ──────────────────────────────────
async function classificationNotificationJob() {
  const recientes = await TorneoPartido.findAll({ where: { ronda: 'zona', estado: ['jugado', 'walkover'], updated_at: { [Op.gte]: hace(VENTANA_EVENTOS_H) } }, attributes: ['zona_id'], group: ['zona_id'], raw: true });
  const zonaIds = recientes.map(r => r.zona_id).filter(Boolean);
  if (!zonaIds.length) return 0;
  const zonas = await TorneoZona.findAll({ where: { id: zonaIds }, include: [{ model: TorneoPartido, as: 'partidos', attributes: ['estado'], include: [{ model: TorneoResultado, as: 'resultado', attributes: ['id'] }] }, { model: TorneoTablaPosicion, as: 'tabla', attributes: ['pareja_id', 'posicion'] }] });
  const completas = zonas.filter(z => z.partidos.length && z.partidos.every(p => ['jugado', 'walkover'].includes(p.estado)));
  if (!completas.length) return 0;
  const torneos = await torneosPorId(completas.map(z => z.torneo_id));
  const clasificadas = [];
  for (const z of completas) {
    const t = torneos.get(z.torneo_id);
    if (!t) continue;
    const k = Math.min(t.clasifican_por_zona || 2, z.tabla.length);
    const version = Math.max(0, ...z.partidos.map(p => p.resultado?.id || 0));   // cambia si se recarga un resultado
    for (const r of z.tabla.filter(x => x.posicion <= k)) clasificadas.push({ t, z, version, pareja_id: r.pareja_id });
  }
  if (!clasificadas.length) return 0;
  const parejas = await TorneoPareja.findAll({ where: { id: clasificadas.map(c => c.pareja_id), estado_pago: PAREJAS_ACTIVAS }, include: [JUGADORES()] });
  const items = clasificadas.flatMap(c => destinatarios(parejas.find(p => p.id === c.pareja_id))
    .map(d => ({ ...d, tipo: 'clasificado_zona', torneo: c.t, dedupe: `clasificado_zona:${c.z.id}:v${c.version}:${d.dni}` })));
  return (await svc.encolar(items)).encoladas;
}

// ── 5. Final (campeón / subcampeón) + torneo finalizado ───────
async function finalNotificationJob() {
  let n = await notificarResultados(['final'], hace(VENTANA_EVENTOS_H));
  const cerrados = await Torneo.findAll({ where: { estado: 'finalizado', updated_at: { [Op.gte]: hace(VENTANA_EVENTOS_H) } }, attributes: ['id', 'id_tenant', 'nombre', 'estado'], raw: true });
  for (const t of cerrados) {
    const parejas = await TorneoPareja.findAll({ where: { torneo_id: t.id, estado_pago: PAREJAS_ACTIVAS }, include: [JUGADORES()] });
    const items = parejas.flatMap(p => destinatarios(p)).map(d => ({ ...d, tipo: 'torneo_finalizado', torneo: t, dedupe: `torneo_finalizado:${t.id}:${d.dni}` }));
    n += (await svc.encolar(items)).encoladas;
  }
  return n;
}

// ── Scheduler ─────────────────────────────────────────────────
const JOBS = {
  matchReminderJob: [matchReminderJob, 60],
  paymentReminderJob: [paymentReminderJob, 30 * 60],
  resultNotificationJob: [resultNotificationJob, 60],
  classificationNotificationJob: [classificationNotificationJob, 120],
  finalNotificationJob: [finalNotificationJob, 120],
  queue: [() => svc.procesarCola(), 15],
};
const corriendo = new Set();
const estado = {};   // nombre → { ultima, ok, encoladas, error, error_at }: diagnóstico en el panel
async function correr(nombre) {
  if (corriendo.has(nombre)) return;   // sin solapamiento si una pasada tarda más que el intervalo
  corriendo.add(nombre);
  const e = (estado[nombre] ||= { corridas: 0 });
  try {
    const n = await JOBS[nombre][0]();
    Object.assign(e, { ultima: new Date(), ok: true, encoladas: n || 0, corridas: e.corridas + 1 });
    if (n && nombre !== 'queue') console.log(`[notif] ${nombre}: ${n} notificación(es) encolada(s)`);
  } catch (err) {
    Object.assign(e, { ultima: new Date(), ok: false, error: err.message, error_at: new Date(), corridas: e.corridas + 1 });
    console.error(`[notif] ${nombre}:`, err.message);
  } finally { corriendo.delete(nombre); }
}

/**
 * Disparo inmediato al cargar un resultado (no espera al próximo ciclo del scheduler).
 * Agrupa cargas seguidas (1,5 s) y corre resultados → clasificación → final → cola.
 */
let pendienteDisparo = null;
function dispararResultados() {
  // Solo en el servidor real (scheduler iniciado) o si se pide explícitamente (TORNEO_PUSH_JOBS=1, tests)
  if (pendienteDisparo || (!timers.length && process.env.TORNEO_PUSH_JOBS !== '1')) return;
  pendienteDisparo = setTimeout(async () => {
    pendienteDisparo = null;
    for (const n of ['resultNotificationJob', 'classificationNotificationJob', 'finalNotificationJob', 'queue']) await correr(n);
  }, 1500);
  pendienteDisparo.unref?.();
}
const estadoJobs = () => ({ activos: timers.length > 0, jobs: estado });
let timers = [];
function iniciar() {
  if (process.env.TORNEO_PUSH_JOBS === '0') { console.log('· Notificaciones push de torneos: jobs deshabilitados (TORNEO_PUSH_JOBS=0)'); return; }
  timers = Object.entries(JOBS).map(([nombre, [, seg]], i) => {
    setTimeout(() => correr(nombre), 5000 + i * 1500).unref?.();   // arranque escalonado
    return setInterval(() => correr(nombre), seg * 1000).unref?.();
  });
  console.log('✓ Notificaciones push de torneos: jobs iniciados');
}
const detener = () => { timers.forEach(t => clearInterval(t)); timers = []; };

module.exports = { iniciar, detener, dispararResultados, estadoJobs, matchReminderJob, paymentReminderJob, resultNotificationJob, classificationNotificationJob, finalNotificationJob };
