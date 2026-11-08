/**
 * tests/pay.e2e.js — Jugahoy Pay por la API real (club TEMPORAL; Mercado Pago simulado).
 *
 *   npm run test:pay:e2e
 *
 * Turno $24.000 + consumos → liquidación con QR por jugador; checkout; webhook (firma, duplicados,
 * otro club, pendiente → aprobado); turno cobrado y caja al completar; portería (cobro manual);
 * pago parcial; cuota de escuela pagada por QR; cuenta corriente y cobro de saldo (Modo 9);
 * reembolso; cancelación; vencimiento; SSE en tiempo real; dashboard; permisos y aislamiento por club.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();
process.env.PAY_JOBS = '0';
process.env.TORNEO_PUSH_JOBS = '0';
process.env.MP_WEBHOOK_SECRET = 'secreto-test';

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const crypto = require('crypto');
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const mpOAuth = require('../src/services/mercadopagoOAuth.service');
  const { PROVIDERS } = require('../src/services/pay/providers');
  const engine = require('../src/services/pay/payEngine');

  // ── Mercado Pago simulado: pagos en memoria ──
  const pagosMp = new Map();
  const mp = PROVIDERS.mercadopago;
  mpOAuth.puedeCobrar = async () => true;
  mp.crearCheckout = async (orden, { monto }) => ({ checkoutId: `pref-${orden.id}`, url: `https://mp.test/checkout/${orden.token}?monto=${monto}` });
  mp.consultarPago = async (id) => { const p = pagosMp.get(String(id)); if (!p) throw new Error('no existe'); return { ...p }; };
  const reembolsos = [];
  mp.reembolsar = async (id) => { reembolsos.push(id); return { ok: true }; };
  let seq = 900000 + (Date.now() % 10000);
  const pagar = (orden, estado = 'approved', monto) => {
    const id = String(++seq);
    pagosMp.set(id, { id, estado, monto: monto ?? Number(orden.importe), metodo: 'credit_card', cuotas: 3, referencia: orden.token, aprobadoAt: estado === 'approved' ? new Date() : null, raw: { status: estado } });
    return id;
  };

  const server = app.listen(0);
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Ana', apellido: 'Caja', email: `pay-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const otro = await m.User.create({ nombre: 'Otro', apellido: 'Club', email: `pay2-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `PAY TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const club2 = await m.Complex.create({ nombre: `PAY TEST2 ${s}`, direccion: 'x', owner_id: otro.id, activo: true });
  const cancha = await m.Field.create({ complex_id: club.id, nombre: 'Cancha 1', deporte: 'padel', activa: true });
  const caja = await m.CashRegister.create({ complex_id: club.id, monto_inicial: 0, estado: 'abierta', usuario_id: admin.id }).catch(() => m.CashRegister.create({ complex_id: club.id, monto_inicial: 0, estado: 'abierta' }));
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const call = async (method, path, body, u = admin) => {
    const r = await fetch(`${root}${path}`, { method, headers: { ...(u && { Authorization: `Bearer ${tk(u)}` }), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const C = `/pay/club/${club.id}`;
  const webhook = async (paymentId, { complexId = club.id, firma = true, requestId = crypto.randomUUID() } = {}) => {
    const ts = String(Date.now());
    const v1 = crypto.createHmac('sha256', 'secreto-test').update(`id:${paymentId};request-id:${requestId};ts:${ts};`).digest('hex');
    const r = await fetch(`${root}/webhooks/mercadopago?complex_id=${complexId}&data.id=${paymentId}&type=payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${firma ? v1 : 'mala'}` },
      body: JSON.stringify({ type: 'payment', data: { id: paymentId } }),
    });
    return r.status;
  };
  const cajaTotal = async () => Number((await m.CashTransaction.sum('monto', { where: { cash_register_id: caja.id, tipo: 'ingreso' } })) || 0);

  try {
    // ── Turno $24.000 + consumos ──
    const b = await m.Booking.create({ field_id: cancha.id, fecha: '2026-12-20', hora_inicio: '20:00', hora_fin: '21:30', duracion: 90, nombre_cliente: 'Juan', monto: 24000, estado: 'confirmado', tipo_pago: 'complejo' });
    const prod = await m.CantinaProducto.create({ complex_id: club.id, nombre: 'Gatorade', precio_venta: 2000, stock: 10 });
    const cons = [];
    for (const [nombre, sub] of [['Gatorade', 2000], ['Agua', 1000], ['Sándwich', 3000]]) cons.push(await m.BookingConsumo.create({ booking_id: b.id, producto_id: prod.id, nombre_producto: nombre, cantidad: 1, precio_unitario: sub, subtotal: sub }));
    const jugadores = [{ nombre: 'Juan', dni: `30${s % 1000000}` }, { nombre: 'Pedro' }, { nombre: 'Lucas', email: `lucas-${s}@test.local` }, { nombre: 'Martín', telefono: '5493815550000' }];
    const asignaciones = { [cons[0].id]: { tipo: 'jugador', indice: 0 }, [cons[1].id]: { tipo: 'jugador', indice: 2 }, [cons[2].id]: { tipo: 'jugador', indice: 3 } };
    const prev = await call('POST', `${C}/reservas/${b.id}/liquidacion`, { jugadores, modo: 'iguales', asignaciones });
    ok(prev.status === 200 && JSON.stringify(prev.data.pagadores.map(p => p.total)) === '[8000,6000,7000,9000]' && !prev.data.ordenes, `vista previa: Juan 8.000 · Pedro 6.000 · Lucas 7.000 · Martín 9.000 (sin generar)`);
    const gen = await call('POST', `${C}/reservas/${b.id}/liquidacion`, { jugadores, modo: 'iguales', asignaciones, generar: true });
    ok(gen.status === 200 && gen.data.ordenes.length === 4 && gen.data.ordenes.every(o => o.qr.startsWith('data:image/png') && o.url.endsWith(`/pay/${o.token}`) && /^[0-9a-f-]{36}$/.test(o.token)), 'genera 4 órdenes con QR, URL /pay/:token y token UUID');
    ok(new Set(gen.data.ordenes.map(o => o.grupo)).size === 1, 'las 4 órdenes comparten la liquidación (grupo)');
    ok((await call('POST', `${C}/reservas/${b.id}/liquidacion`, { jugadores, modo: 'iguales', generar: true })).status === 409, 'no se puede generar otra liquidación con una en curso');
    const cobroViejo = await call('POST', `/agenda/${club.id}/turno/${b.id}/cobrar`, { jugadores: 4 });
    ok(cobroViejo.status === 409 && /Jugahoy Pay/.test(cobroViejo.data?.message || ''), 'el cobro manual de la agenda queda bloqueado (evita doble ingreso)');
    const [oJuan, oPedro, oLucas, oMartin] = gen.data.ordenes;

    // ── Página pública + checkout ──
    const pub = await call('GET', `/pay/public/${oJuan.token}`, null, null);
    ok(pub.status === 200 && pub.data.importe === 8000 && pub.data.club.nombre === club.nombre && pub.data.detalle.length === 2 && pub.data.puede_pagar && !pub.data.cliente_dni, 'página pública: club, concepto, importe, detalle y estado');
    ok((await call('GET', '/pay/public/no-es-un-token', null, null)).status === 404, 'token inválido → 404');
    const qr = await fetch(`${root}/pay/public/${oJuan.token}/qr`);
    ok(qr.status === 200 && qr.headers.get('content-type').includes('png'), 'QR PNG público');
    const co = await call('POST', `/pay/public/${oJuan.token}/checkout`, {}, null);
    ok(co.status === 200 && co.data.url.includes(oJuan.token) && co.data.monto === 8000, 'checkout: link de Mercado Pago por el total');
    ok((await call('POST', `/pay/public/${oJuan.token}/checkout`, { monto: 100 }, null)).status === 400, 'pago parcial rechazado si la orden no lo permite');

    // ── SSE en tiempo real ──
    const eventos = [];
    const ctrl = new AbortController();
    const sse = fetch(`${root}/pay/public/${oJuan.token}/events`, { signal: ctrl.signal }).then(async (r) => {
      const reader = r.body.getReader(); const dec = new TextDecoder();
      for (;;) { const { value, done } = await reader.read(); if (done) break; for (const l of dec.decode(value).split('\n')) if (l.startsWith('data: ')) eventos.push(JSON.parse(l.slice(6))); }
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));

    // ── Webhooks ──
    const pagoJuan = pagar(oJuan);
    ok(await webhook(pagoJuan, { firma: false }) === 401, 'webhook con firma inválida → 401');
    ok((await m.PayOrder.findByPk(oJuan.id)).estado === 'pendiente', 'firma inválida: la orden no cambia');
    ok(await webhook(pagoJuan, { complexId: club2.id }) === 200 && (await m.PayOrder.findByPk(oJuan.id)).estado === 'pendiente', 'pago informado para OTRO club: se ignora');
    const cajaAntes = await cajaTotal();
    ok(await webhook(pagoJuan) === 200, 'webhook válido');
    let oj = await m.PayOrder.findByPk(oJuan.id);
    ok(oj.estado === 'aprobado' && Number(oj.importe_pagado) === 8000 && oj.metodo === 'mercadopago', 'Juan: aprobado $8.000');
    ok(await webhook(pagoJuan) === 200 && await webhook(pagoJuan) === 200, 'webhooks repetidos responden 200');
    ok(await m.PayPayment.count({ where: { order_id: oJuan.id } }) === 1 && Number((await m.PayOrder.findByPk(oJuan.id)).importe_pagado) === 8000, 'duplicados: el pago se registra una sola vez');
    ok(await cajaTotal() - cajaAntes === 8000, 'caja: ingreso de $8.000 (cancha + Gatorade, desglosado)');
    await new Promise(r => setTimeout(r, 200));
    ok(eventos.some(e => e.estado === 'aprobado'), 'SSE: la página recibe "aprobado" en tiempo real');
    ctrl.abort(); await sse;

    // Pendiente → aprobado (transferencia)
    const pagoPedro = pagar(oPedro, 'pending');
    await webhook(pagoPedro);
    ok((await m.PayOrder.findByPk(oPedro.id)).estado === 'procesando', 'pago pendiente → "procesando"');
    pagosMp.get(pagoPedro).estado = 'approved';
    await webhook(pagoPedro);
    ok((await m.PayOrder.findByPk(oPedro.id)).estado === 'aprobado', 'después se aprueba → "aprobado"');
    // Rechazado → se puede reintentar
    const rech = pagar(oLucas, 'rejected');
    await webhook(rech);
    ok((await m.PayOrder.findByPk(oLucas.id)).estado === 'rechazado' && (await call('POST', `/pay/public/${oLucas.token}/checkout`, {}, null)).status === 200, 'rechazado → puede volver a intentar');
    await webhook(pagar(oLucas));
    // Martín paga en efectivo en portería
    const man = await call('POST', `${C}/ordenes/${oMartin.id}/confirmar`, { metodo: 'efectivo' });
    ok(man.status === 200 && man.data.estado === 'aprobado', 'cobro manual en efectivo');
    const bk = await m.Booking.findByPk(b.id);
    ok(bk.cobrado && bk.cobro_detalle?.via === 'jugahoy_pay' && bk.cobro_detalle.pagos.length === 4, 'con los 4 pagos el turno queda COBRADO');
    ok(await m.CantinaVenta.count({ where: { complex_id: club.id, notas: { [require('sequelize').Op.like]: `%turno #${b.id}%` } } }) === 1, 'los consumos pasan a venta de cantina');

    // ── Portería: cobro QR genérico con pago parcial ──
    const ord = await call('POST', `${C}/ordenes`, { concepto: 'Alquiler de paletas', importe: 5000, modulo: 'alquiler', permite_parcial: true, cliente: { nombre: 'Rocío', dni: `40${s % 1000000}` } });
    ok(ord.status === 201 && ord.data.qr && ord.data.estado === 'pendiente', 'portería: orden con QR');
    ok((await call('POST', `/pay/public/${ord.data.token}/checkout`, { monto: 2000 }, null)).data.monto === 2000, 'pago parcial habilitado');
    await webhook(pagar(ord.data, 'approved', 2000));
    let o2 = await m.PayOrder.findByPk(ord.data.id);
    ok(o2.estado === 'parcial' && Number(o2.importe_pagado) === 2000, 'pago parcial → "parcial" (debe $3.000)');
    const cta = await call('GET', `${C}/cuenta/${encodeURIComponent(o2.cliente_key)}`);
    ok(cta.status === 200 && cta.data.deuda_total === 3000 && cta.data.movimientos.length === 2, 'cuenta corriente: cargo $5.000, pago $2.000 → deuda $3.000');
    // Modo 9: cobrar el saldo pendiente
    const ord2 = await call('POST', `${C}/ordenes`, { concepto: 'Clase particular', importe: 7000, modulo: 'clase', cliente: { nombre: 'Rocío', dni: `40${s % 1000000}` } });
    const saldo = await call('POST', `${C}/cuenta/${encodeURIComponent(o2.cliente_key)}/cobrar-saldo`);
    ok(saldo.status === 201 && saldo.data.importe === 10000 && saldo.data.detalle.length === 2, 'cobrar saldo: una orden por $10.000 (3.000 + 7.000)');
    await webhook(pagar(saldo.data));
    o2 = await m.PayOrder.findByPk(ord.data.id);
    ok(o2.estado === 'aprobado' && (await m.PayOrder.findByPk(ord2.data.id)).estado === 'aprobado', 'al pagar el saldo se cancelan las órdenes incluidas');
    ok((await call('GET', `${C}/cuenta/${encodeURIComponent(o2.cliente_key)}`)).data.deuda_total === 0, 'deuda en $0');

    // ── Escuela: cuota pagada por QR ──
    const cat = await m.EscuelaCategoria.create({ complex_id: club.id, nombre: 'Sub-12', edad_min: 8, edad_max: 12, cupos: 20 });
    const alumno = await m.EscuelaAlumno.create({ complex_id: club.id, categoria_id: cat.id, nombre: 'Juan Pérez', dni: `45${s % 1000000}`, fecha_nacimiento: '2015-01-01', genero: 'masculino', responsable_nombre: 'Padre', responsable_whatsapp: '5493815551111', responsable_email: `padre-${s}@test.local`, token_portal: crypto.randomBytes(16).toString('hex') });
    const cuota = await m.EscuelaPago.create({ alumno_id: alumno.id, periodo: '2026-12', monto: 18000 });
    const oc = await call('POST', `${C}/escuela/cuotas/${cuota.id}/orden`);
    ok(oc.status === 201 && oc.data.importe === 18000 && oc.data.metadata.vencimiento, 'cuota: orden con QR y vencimiento');
    ok((await call('POST', `${C}/escuela/cuotas/${cuota.id}/orden`)).data.id === oc.data.id, 'pedir de nuevo devuelve la misma orden');
    await webhook(pagar(oc.data));
    const cuotaPagada = await m.EscuelaPago.findByPk(cuota.id);
    ok(cuotaPagada.estado === 'pagado' && cuotaPagada.metodo_pago === 'mercadopago' && cuotaPagada.comprobante?.startsWith('PAY-'), 'la cuota queda PAGADA (mercadopago)');
    const rec = await call('POST', `${C}/ordenes/${oc.data.id}/recordatorio`);
    ok(rec.status === 200 && rec.data.canales.includes('email') && rec.data.whatsapp?.includes('wa.me'), 'recordatorio: email + link de WhatsApp');

    // ── Reembolso / cancelación / vencimiento ──
    const rf = await call('POST', `${C}/ordenes/${oc.data.id}/reembolsar`);
    ok(rf.status === 200 && rf.data.estado === 'reembolsado' && reembolsos.length === 1 && (await m.EscuelaPago.findByPk(cuota.id)).estado === 'pendiente', 'reembolso en MP: orden reembolsada y la cuota vuelve a pendiente');
    const oc3 = await call('POST', `${C}/ordenes`, { concepto: 'Entrada evento', importe: 1500, modulo: 'evento' });
    ok((await call('POST', `${C}/ordenes/${oc3.data.id}/cancelar`, { motivo: 'error' })).data.estado === 'cancelado', 'cancelar una orden sin pagos');
    ok((await call('POST', `/pay/public/${oc3.data.token}/checkout`, {}, null)).status === 409, 'orden cancelada no se puede pagar');
    const ov = await engine.createPaymentOrder({ complexId: club.id, modulo: 'otro', concepto: 'Vence', importe: 100, venceAt: new Date(Date.now() - 1000) });
    ok((await call('GET', `/pay/public/${ov.token}`, null, null)).data.estado === 'vencido', 'orden vencida');

    // ── Auditoría, dashboard, permisos ──
    const det = await call('GET', `${C}/ordenes/${oJuan.id}`);
    ok(det.data.eventos.some(e => e.tipo === 'creada') && det.data.eventos.some(e => e.tipo === 'pago_aprobado' && e.origen === 'webhook') && det.data.pagos.length === 1, 'auditoría: eventos y pagos de la orden');
    const logs = await m.PayWebhookLog.count({ where: { complex_id: club.id } });
    ok(logs >= 8, `log de webhooks (${logs})`);
    const dash = await call('GET', `${C}/dashboard`);
    ok(dash.status === 200 && dash.data.cobros_hoy >= 8000 + 6000 + 7000 + 9000 && dash.data.reservas === 30000 && dash.data.por_modulo.length >= 3 && typeof dash.data.conversion_qr === 'number', `dashboard: hoy $${dash.data.cobros_hoy}, reservas $${dash.data.reservas}, conversión ${dash.data.conversion_qr}%`);
    ok((await call('GET', `${C}/ordenes`, null, otro)).status === 403, 'otro club no ve las órdenes (403)');
    ok((await call('GET', `${C}/ordenes`, null, null)).status === 401, 'sin sesión → 401');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    await m.sequelize.query('DELETE FROM pay_webhook_logs WHERE complex_id IN (?, ?)', { replacements: [club.id, club2.id] }).catch(() => {});
    await m.sequelize.query('DELETE FROM pay_account_movements WHERE complex_id = ?', { replacements: [club.id] }).catch(() => {});
    await m.sequelize.query('DELETE FROM pay_orders WHERE complex_id = ?', { replacements: [club.id] }).catch(e => console.error('limpieza', e.message));
    const ventas = await m.CantinaVenta.findAll({ where: { complex_id: club.id }, attributes: ['id'], raw: true });
    await m.CantinaDetalleVenta.destroy({ where: { venta_id: ventas.map(v => v.id) } }).catch(() => {});
    await m.CantinaVenta.destroy({ where: { complex_id: club.id } }).catch(() => {});
    await m.CashTransaction.destroy({ where: { cash_register_id: caja.id } }).catch(() => {});
    await caja.destroy().catch(() => {});
    await m.sequelize.query('DELETE FROM booking_consumos WHERE booking_id IN (SELECT id FROM bookings WHERE field_id = ?)', { replacements: [cancha.id] }).catch(() => {});
    await m.Booking.destroy({ where: { field_id: cancha.id } }).catch(() => {});
    await m.CantinaProducto.destroy({ where: { complex_id: club.id } }).catch(() => {});
    const alumnos = (await m.EscuelaAlumno.findAll({ where: { complex_id: club.id }, attributes: ['id'], raw: true })).map(a => a.id);
    if (alumnos.length) await m.EscuelaPago.destroy({ where: { alumno_id: alumnos } }).catch(() => {});
    await m.EscuelaAlumno.destroy({ where: { complex_id: club.id } }).catch(() => {});
    await m.EscuelaCategoria.destroy({ where: { complex_id: club.id } }).catch(() => {});
    await m.Field.destroy({ where: { id: cancha.id } }).catch(() => {});
    await m.sequelize.query('DELETE FROM complexes WHERE id IN (?, ?)', { replacements: [club.id, club2.id] }).catch(e => console.error('limpieza club', e.message));
    await admin.destroy().catch(() => {});
    await otro.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
