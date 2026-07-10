'use strict';
/**
 * scripts/seed-localidades.js
 * Lee backend/localidades.json (formato Georef Argentina: { localidades_censales: [...] }),
 * extrae provincia.nombre, departamento.nombre y nombre (localidad) y los inserta en
 * la tabla `localidades`.
 *
 * Uso:
 *   node scripts/seed-localidades.js           → inserta solo si la tabla está vacía
 *   node scripts/seed-localidades.js --force    → vacía la tabla y recarga desde cero
 *
 * Diseño:
 *   - Idempotente: no duplica datos en corridas repetidas.
 *   - bulkCreate por lotes (chunks) para no armar un único INSERT gigante.
 *   - Inserción dentro de una transacción → o entra todo o no entra nada.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const { sequelize, Localidad } = require('../src/models');

const JSON_PATH  = path.join(__dirname, '..', 'localidades.json');
const CHUNK_SIZE = 500;
const FORCE      = process.argv.includes('--force');

// Normaliza un string: recorta espacios y colapsa nulos/vacíos a null
function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function seed() {
  await sequelize.authenticate();

  // 1) Leer y parsear el archivo
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`No se encontró el archivo: ${JSON_PATH}`);
  }
  const raw  = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rows = raw.localidades_censales || raw.localidades || (Array.isArray(raw) ? raw : []);
  if (!rows.length) throw new Error('El JSON no contiene registros de localidades');

  // 2) Evitar duplicados en corridas repetidas
  const existing = await Localidad.count();
  if (existing > 0 && !FORCE) {
    console.log(`⚠ La tabla ya tiene ${existing} registros. Usá --force para recargar. Nada que hacer.`);
    return process.exit(0);
  }

  // 3) Mapear solo los campos requeridos, descartando registros sin localidad/provincia
  const records = [];
  let skipped = 0;
  for (const r of rows) {
    const provincia_nombre    = clean(r.provincia?.nombre);
    const departamento_nombre = clean(r.departamento?.nombre); // puede ser null
    const localidad_nombre    = clean(r.nombre);

    if (!provincia_nombre || !localidad_nombre) { skipped++; continue; }
    records.push({ provincia_nombre, departamento_nombre, localidad_nombre });
  }

  console.log(`→ ${records.length} localidades a insertar (${skipped} descartadas por datos incompletos)`);

  // 4) Insertar en una transacción, por lotes
  const t = await sequelize.transaction();
  try {
    if (FORCE && existing > 0) {
      // TRUNCATE reinicia el autoincremental; en MySQL no admite WHERE
      await sequelize.query('TRUNCATE TABLE `localidades`', { transaction: t });
      console.log('✓ Tabla vaciada (--force)');
    }

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      await Localidad.bulkCreate(chunk, { transaction: t, validate: true });
      process.stdout.write(`  insertados ${Math.min(i + CHUNK_SIZE, records.length)}/${records.length}\r`);
    }

    await t.commit();
    console.log(`\n✓ Carga completa: ${records.length} localidades en la tabla \`localidades\``);
  } catch (err) {
    await t.rollback();
    throw err;
  }

  process.exit(0);
}

seed().catch(e => { console.error('\n✗', e.message); process.exit(1); });
