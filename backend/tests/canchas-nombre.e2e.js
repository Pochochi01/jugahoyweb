/**
 * tests/canchas-nombre.e2e.js — Nombre editable de las canchas (club TEMPORAL).   npm run test:canchas
 * Alta con y sin nombre · renombrar · el identificador (C1, C2…) no cambia · vacío → 400 ·
 * nombre repetido en el complejo → 409 · otro club no puede renombrar.
 */
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();

let fallas = 0, total = 0;
const ok = (c, msg) => { total++; console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallas++; };

(async () => {
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const m = require('../src/models');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/settings`;
  const s = Date.now();
  const admin = await m.User.create({ nombre: 'Cami', apellido: 'Cancha', email: `cn-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const club = await m.Complex.create({ nombre: `CN TEST ${s}`, direccion: 'x', owner_id: admin.id, activo: true });
  const otroAdmin = await m.User.create({ nombre: 'Otro', apellido: 'Club', email: `cn2-${s}@test.local`, password: 'x', rol: 'complex_admin', activo: true });
  const otroClub = await m.Complex.create({ nombre: `CN2 TEST ${s}`, direccion: 'x', owner_id: otroAdmin.id, activo: true });
  const tk = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const call = async (method, path, body, u = admin) => {
    const r = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tk(u)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    const cancha = { deporte: 'padel', superficie: 'cesped', precio_base: 1000, hora_apertura: '08:00', hora_cierre: '23:00', duracion_turno: 60 };
    const c1 = await call('POST', `/${club.id}/fields`, cancha);
    ok(c1.status === 201 && c1.data.nombre === 'C1' && c1.data.identificador === 'C1', `alta sin nombre → usa el identificador (${c1.status} ${c1.data?.message || c1.data?.nombre})`);
    const c2 = await call('POST', `/${club.id}/fields`, { ...cancha, nombre: '  Cancha   Central ' });
    ok(c2.status === 201 && c2.data.nombre === 'Cancha Central' && c2.data.identificador === 'C2', 'alta con nombre propio (espacios normalizados)');
    const r1 = await call('PUT', `/${club.id}/fields/${c1.data.id}`, { nombre: 'Cancha Panorámica', identificador: 'X9' });
    ok(r1.status === 200 && r1.data.nombre === 'Cancha Panorámica' && r1.data.identificador === 'C1', 'renombrar: cambia el nombre, el identificador sigue C1');
    ok((await call('PUT', `/${club.id}/fields/${c1.data.id}`, { nombre: '   ' })).status === 400, 'nombre vacío → 400');
    ok((await call('PUT', `/${club.id}/fields/${c1.data.id}`, { nombre: 'x'.repeat(101) })).status === 400, 'nombre de más de 100 caracteres → 400');
    const dup = await call('PUT', `/${club.id}/fields/${c1.data.id}`, { nombre: 'cancha central' });
    ok(dup.status === 409 && /Ya hay una cancha llamada/.test(dup.data?.message || ''), 'nombre repetido en el complejo (sin distinguir mayúsculas) → 409');
    ok((await call('PUT', `/${club.id}/fields/${c1.data.id}`, { nombre: 'Cancha Panorámica', precio_base: 1500 })).status === 200, 'guardar sin cambiar el nombre (otros datos) → 200');
    ok((await call('PUT', `/${club.id}/fields/${c1.data.id}`, { precio_base: 1600 })).status === 200 && (await m.Field.findByPk(c1.data.id)).nombre === 'Cancha Panorámica', 'editar otros datos sin mandar el nombre lo conserva');
    const ajeno = await call('PUT', `/${otroClub.id}/fields/${c1.data.id}`, { nombre: 'Hackeada' }, otroAdmin);
    ok(ajeno.status === 404 && (await m.Field.findByPk(c1.data.id)).nombre === 'Cancha Panorámica', 'otro club no puede renombrar una cancha ajena → 404');
  } catch (e) {
    console.error(e); fallas++;
  } finally {
    const ids = (await m.Field.findAll({ where: { complex_id: club.id }, attributes: ['id'], raw: true })).map(f => f.id);
    if (ids.length) await m.TimeSlot.destroy({ where: { field_id: ids } }).catch(() => {});
    await m.Field.destroy({ where: { complex_id: [club.id, otroClub.id] } }).catch(() => {});
    await m.sequelize.query('DELETE FROM complexes WHERE id IN (?, ?)', { replacements: [club.id, otroClub.id] }).catch(() => {});
    await admin.destroy().catch(() => {}); await otroAdmin.destroy().catch(() => {});
    server.close();
    await m.sequelize.close();
    console.log(`\n${total - fallas}/${total} OK${fallas ? ` · ${fallas} FALLA(S)` : ''}`);
    process.exit(fallas ? 1 : 0);
  }
})();
