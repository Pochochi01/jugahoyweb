'use strict';
/**
 * tests/pay-liquidacion.test.js — Motor de liquidación de Jugahoy Pay (sin base de datos).
 *
 *   npm run test:pay
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const liq = require('../src/services/pay/liquidacion');
const { clienteKey } = require('../src/services/pay/payEngine');

const J = ['Juan', 'Pedro', 'Lucas', 'Martín'].map(nombre => ({ nombre }));
const pesos = (c) => c.map(x => x / 100);

test('división automática: $24.000 entre 4 → $6.000 cada uno', () => {
  assert.deepEqual(pesos(liq.splitReservationPayment(24000, J, { modo: 'iguales' })), [6000, 6000, 6000, 6000]);
});

test('división con resto: la suma es exacta al centavo', () => {
  const c = liq.splitReservationPayment(10000, J.slice(0, 3), { modo: 'iguales' });
  assert.equal(c.reduce((a, b) => a + b, 0), 1000000);
  assert.deepEqual(pesos(c), [3333.34, 3333.33, 3333.33]);
});

test('un jugador paga todo', () => {
  assert.deepEqual(pesos(liq.splitReservationPayment(24000, J, { modo: 'uno', pagador: 2 })), [0, 0, 24000, 0]);
  assert.throws(() => liq.splitReservationPayment(24000, J, { modo: 'uno', pagador: 9 }), /quién paga/);
});

test('porcentajes', () => {
  assert.deepEqual(pesos(liq.splitReservationPayment(24000, J, { modo: 'porcentaje', porcentajes: [40, 20, 20, 20] })), [9600, 4800, 4800, 4800]);
  assert.throws(() => liq.splitReservationPayment(24000, J, { modo: 'porcentaje', porcentajes: [50, 20, 20, 20] }), /sumar 100/);
  assert.throws(() => liq.splitReservationPayment(24000, J, { modo: 'porcentaje', porcentajes: [100] }), /porcentaje/);
});

test('por pareja: cada pareja la mitad', () => {
  assert.deepEqual(pesos(liq.splitReservationPayment(24000, J, { modo: 'pareja' })), [6000, 6000, 6000, 6000]);
  assert.deepEqual(pesos(liq.splitReservationPayment(24000, J, { modo: 'pareja', parejas: [[0, 3], [1, 2]] })), [6000, 6000, 6000, 6000]);
  assert.throws(() => liq.splitReservationPayment(24000, J, { modo: 'pareja', parejas: [[0, 1], [1, 2]] }), /una sola vez/);
});

test('validaciones', () => {
  assert.throws(() => liq.splitReservationPayment(100, [], {}), /al menos un jugador/);
  assert.throws(() => liq.splitReservationPayment(100, [{ nombre: '' }], {}), /nombre/);
  assert.throws(() => liq.splitReservationPayment(100, J, { modo: 'x' }), /Modo/);
  assert.throws(() => liq.splitReservationPayment(-5, J, {}), /Importe/);
});

test('consumos: a un jugador, a una pareja y al grupo', () => {
  const lineas = liq.calculateConsumptionDistribution(
    [{ id: 1, nombre: 'Gatorade', subtotal: 2000 }, { id: 2, nombre: 'Agua', subtotal: 1000 }, { id: 3, nombre: 'Pizza', subtotal: 8000 }, { id: 4, nombre: 'Hielo', subtotal: 1000 }],
    { 1: { tipo: 'jugador', indice: 0 }, 2: { tipo: 'pareja', indice: 1 }, 3: { tipo: 'grupo' } }, 4);
  const tot = lineas.map(l => l.reduce((a, x) => a + x.centavos, 0) / 100);
  assert.deepEqual(tot, [2000 + 2000 + 250, 2000 + 250, 500 + 2000 + 250, 500 + 2000 + 250]);
  assert.ok(lineas[2].some(l => l.concepto === 'Agua (1/2)'));
  assert.throws(() => liq.calculateConsumptionDistribution([{ id: 1, nombre: 'X', subtotal: 1 }], { 1: { tipo: 'jugador', indice: 7 } }, 4), /jugador inválido/);
  assert.throws(() => liq.calculateConsumptionDistribution([{ id: 1, nombre: 'X', subtotal: 1 }], { 1: { tipo: 'mesa' } }, 4), /asignación/);
});

test('liquidación consolidada (ejemplo del pedido)', () => {
  const r = liq.mergeReservationAndConsumptions({
    total: 24000, jugadores: J, modo: 'iguales',
    consumos: [{ id: 1, nombre: 'Gatorade', subtotal: 2000 }, { id: 2, nombre: 'Agua', subtotal: 1000 }, { id: 3, nombre: 'Sándwich', subtotal: 3000 }],
    asignaciones: { 1: { tipo: 'jugador', indice: 0 }, 2: { tipo: 'jugador', indice: 2 }, 3: { tipo: 'jugador', indice: 3 } },
  });
  assert.deepEqual(r.pagadores.map(p => [p.nombre, p.total]), [['Juan', 8000], ['Pedro', 6000], ['Lucas', 7000], ['Martín', 9000]]);
  assert.equal(r.total, 30000);
  assert.deepEqual(r.pagadores[0].items, [{ tipo: 'cancha', concepto: 'Cancha', importe: 6000 }, { tipo: 'consumo', concepto: 'Gatorade', importe: 2000 }]);
});

test('liquidación: un jugador paga todo (cancha + todos los consumos) y por pareja', () => {
  const consumos = [{ id: 1, nombre: 'Agua', subtotal: 2000 }, { id: 2, nombre: 'Gaseosa', subtotal: 3000 }, { id: 3, nombre: 'Tostados', subtotal: 5000 }];
  const uno = liq.mergeReservationAndConsumptions({ total: 24000, jugadores: J, modo: 'uno', pagador: 1, consumos, asignaciones: { 1: { tipo: 'jugador', indice: 0 } } });
  assert.equal(uno.pagadores.length, 1);
  assert.equal(uno.pagadores[0].total, 34000);
  assert.equal(uno.pagadores[0].titular.nombre, 'Pedro');
  const par = liq.mergeReservationAndConsumptions({ total: 24000, jugadores: J, modo: 'pareja', consumos, asignaciones: { 3: { tipo: 'pareja', indice: 1 } } });
  assert.deepEqual(par.pagadores.map(p => [p.nombre, p.total]), [['Juan / Pedro', 12000 + 2500], ['Lucas / Martín', 12000 + 2500 + 5000]]);
  assert.equal(par.pagadores[0].items.find(i => i.tipo === 'cancha').importe, 12000, 'agrupa la cancha de los dos');
});

test('liquidación: jugadores con $0 no generan cobro', () => {
  const r = liq.mergeReservationAndConsumptions({ total: 1000, jugadores: J.slice(0, 2), modo: 'porcentaje', porcentajes: [100, 0] });
  assert.equal(r.pagadores.length, 1);
});

test('clave de cuenta corriente: DNI → teléfono → usuario → nombre', () => {
  assert.equal(clienteKey({ dni: '30.123.456', telefono: '381' }), 'dni:30123456');
  assert.equal(clienteKey({ telefono: '+54 9 381 555-1234' }), 'tel:3815551234');
  assert.equal(clienteKey({ userId: 7 }), 'user:7');
  assert.equal(clienteKey({ nombre: 'Martín Pérez' }), 'nom:martin-perez');
  assert.equal(clienteKey({}), null);
});
