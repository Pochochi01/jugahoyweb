'use strict';
/** Inscripciones inteligentes — funciones puras (services/torneos/inscripcionesService.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const ii = require('../src/services/torneos/inscripcionesService');

const J = (nombre, dni, email, whatsapp, extra = {}) => ({ nombre, dni, email, whatsapp, categoria: 6, genero: 'masculino', jugador_id: Number(dni), ...extra });

test('teléfono comparable con y sin 549 / guiones', () => {
  assert.equal(ii.telClave('5493811234567'), ii.telClave('381-123-4567'));
  assert.equal(ii.telClave(''), null);
  assert.equal(ii.telClave(null), null);
  assert.equal(ii.emailLimpio('  Juan@Mail.COM '), 'juan@mail.com');
});

test('datos obligatorios: público vs panel', () => {
  const sinContacto = { nombre: 'Juan', dni: '32123456', email: null, whatsapp: null };
  assert.doesNotThrow(() => ii.exigirDatos(sinContacto, 0, { admin: true }));
  assert.throws(() => ii.exigirDatos(sinContacto, 0, { admin: false }), (e) => e.status === 400 && e.faltantes.join() === 'email,teléfono');
  assert.throws(() => ii.exigirDatos({ ...sinContacto, dni: null }, 0, { admin: true }), /DNI/);
  assert.throws(() => ii.exigirDatos({ ...sinContacto, email: 'x@' }, 0, { admin: true }), /email inválido/);
});

test('inconsistencias antes de armar zonas', () => {
  const ok = [{ id: 1, jugadores: [J('A', '30000001', 'a@x.com', '3811000001'), J('B', '30000002', 'b@x.com', '3811000002')] },
    { id: 2, jugadores: [J('C', '30000003', null, null), J('D', '30000004', null, null)] }];
  assert.deepEqual(ii.inconsistencias(ok), []);
  const mal = [
    { id: 1, jugadores: [J('A', '30000001', 'a@x.com', '5493811000001'), J('B', '30000002', 'A@x.com', '3811000009')] },
    { id: 2, jugadores: [J('C', '30000001', null, '3811000001')] },
  ];
  const p = ii.inconsistencias(mal);
  assert.ok(p.some(x => x.includes('incompleta')));
  assert.ok(p.some(x => x.includes('El DNI 30000001')));
  assert.ok(p.some(x => x.includes('email a@x.com') && x.includes('misma pareja')));
  assert.ok(p.some(x => x.includes('teléfono')));
  assert.ok(!p.some(x => x.startsWith('El jugador')), 'mismo jugador con mismo DNI se informa una sola vez');
  assert.ok(ii.inconsistencias([{ id: 3, jugadores: [J('', 'x', null, null), J('E', '30000005', null, null, { genero: null })] }]).length >= 3);
});

test('bloqueo y permisos de reapertura', () => {
  assert.doesNotThrow(() => ii.asegurarAbiertas({ inscripciones_cerradas: false }));
  assert.throws(() => ii.asegurarAbiertas({ inscripciones_cerradas: true }), (e) => e.status === 409 && e.message === ii.MSG_CERRADAS);
  assert.equal(ii.puedeReabrir({ user: { rol: 'general_admin' } }), true);
  assert.equal(ii.puedeReabrir({ user: { rol: 'complex_admin' } }), true);
  assert.equal(ii.puedeReabrir({ organizador: { id: 1 } }), true);
  assert.equal(ii.puedeReabrir({ user: { rol: 'collaborator' } }), false);
  assert.equal(ii.puedeReabrir({ user: { rol: 'player' } }), false);
});
