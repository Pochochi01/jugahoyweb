'use strict';
/**
 * scripts/fix-duplicate-indexes.js
 * Elimina los índices UNIQUE duplicados que Sequelize `sync()` fue acumulando
 * en columnas con `unique: true` (email_2, token_3, ...). Sin esto, las tablas
 * llegan al límite de 64 índices de MySQL y el backend crashea (ER_TOO_MANY_KEYS).
 *
 * Es seguro e idempotente: solo borra índices cuyo nombre termina en `_<número>`
 * (los duplicados), preservando el índice canónico (email, token, etc.).
 *
 * Uso (en el VPS, dentro de backend/):  node scripts/fix-duplicate-indexes.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sequelize } = require('../src/models');

// Tablas con columnas que tenían `unique: true` inline
const TABLES = ['users', 'invites', 'tokens', 'bookings', 'subscriptions', 'terms_versions'];

async function run() {
  await sequelize.authenticate();
  let totalDropped = 0;

  for (const table of TABLES) {
    let rows;
    try {
      [rows] = await sequelize.query('SHOW INDEX FROM `' + table + '`');
    } catch {
      console.log(`— ${table}: no existe, se omite`);
      continue;
    }
    const dups = [...new Set(rows.map(i => i.Key_name))].filter(n => /_\d+$/.test(n));
    for (const name of dups) {
      await sequelize.query('ALTER TABLE `' + table + '` DROP INDEX `' + name + '`');
    }
    const [after] = await sequelize.query('SHOW INDEX FROM `' + table + '`');
    const left = [...new Set(after.map(i => i.Key_name))].length;
    totalDropped += dups.length;
    console.log(`✓ ${table.padEnd(16)} eliminados ${String(dups.length).padStart(3)} duplicados | quedan ${left} índices`);
  }

  console.log(`\n✔ Total de índices duplicados eliminados: ${totalDropped}`);
  process.exit(0);
}

run().catch(e => { console.error('✗', e.message); process.exit(1); });
