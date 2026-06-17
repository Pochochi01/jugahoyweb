require('dotenv').config();
const { sequelize } = require('../src/models');

const migrations = [
  `ALTER TABLE \`fields\` ADD COLUMN \`precios_por_duracion\` JSON DEFAULT NULL`,
  `ALTER TABLE \`bookings\` ADD COLUMN \`user_id\` INTEGER DEFAULT NULL`,
  `ALTER TABLE \`fields\` ADD COLUMN \`hora_apertura\` VARCHAR(5) DEFAULT '08:00'`,
  `ALTER TABLE \`fields\` ADD COLUMN \`hora_cierre\` VARCHAR(5) DEFAULT '02:00'`,
];

async function run() {
  await sequelize.authenticate();
  for (const sql of migrations) {
    try {
      await sequelize.query(sql);
      console.log(`✓ ${sql.slice(0, 60)}...`);
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log(`⚠ Ya existe: ${sql.slice(0, 60)}`);
      } else {
        console.error(`✗ ${e.message}`);
      }
    }
  }
  process.exit(0);
}
run();
