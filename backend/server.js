require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ── Zona horaria: Argentina (GMT-3) ──────────────────────────
// Debe fijarse ANTES de requerir modelos/app para que todo `new Date()` del
// proceso opere en hora local argentina. Se puede sobreescribir con TZ en .env.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const app = require('./src/app');
const { sequelize } = require('./src/models');

const PORT = process.env.PORT || 3001;

/**
 * Crea SOLO las tablas que todavía no existen; nunca modifica las existentes.
 *
 * Antes se usaba `sequelize.sync()`: con modelos que se referencian entre sí
 * (torneos, escuela) Sequelize entra en su modo "cyclic references" y en CADA
 * arranque ejecuta `ALTER TABLE … ADD FOREIGN KEY` sobre tablas existentes. Si
 * alguna fila no cumple la relación, el ALTER falla y el servidor no levanta
 * (pm2 queda reiniciándolo y el panel no carga). El esquema lo definen las
 * migraciones (`npm run migrate`); esto es solo una red de seguridad.
 */
async function crearTablasFaltantes() {
  const qi = sequelize.getQueryInterface();
  const existentes = new Set((await qi.showAllTables()).map(t => String(typeof t === 'string' ? t : t.tableName).toLowerCase()));
  let pendientes = Object.values(sequelize.models).filter(m => !existentes.has(String(m.getTableName()).toLowerCase()));
  // Varias pasadas: una tabla con FK necesita que exista antes la tabla referenciada
  for (let pasada = 0; pendientes.length && pasada < 5; pasada++) {
    const fallidas = [];
    for (const m of pendientes) {
      try { await m.sync(); console.log(`✓ Tabla creada: ${m.getTableName()}`); }
      catch (err) { fallidas.push(m); if (pasada === 4) console.error(`✗ No se pudo crear ${m.getTableName()}:`, err.message); }
    }
    pendientes = fallidas;
  }
  if (pendientes.length) console.warn(`⚠️  Faltan tablas: ${pendientes.map(m => m.getTableName()).join(', ')}. Corré "npm run migrate".`);
  else console.log('✓ Esquema verificado (sin modificar tablas existentes).');
}

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✓ Conexión a la base de datos establecida.');
    await crearTablasFaltantes();
    const server = app.listen(PORT, () => {
      console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
    });

    // Recordatorios automáticos de turnos (módulo opcional lista/recordatorios).
    try {
      require('./src/services/reminderService').startReminderScheduler(5);
    } catch (err) {
      console.error('✗ No se pudo iniciar el scheduler de recordatorios:', err.message);
    }
    // Chatbot por Baileys: reabre la sesión de los clubes que eligieron ese proveedor
    require('./src/services/baileysService').restaurarClubes()
      .then(n => n && console.log(`[Baileys] restaurando chatbot de ${n} club(es)`)).catch(err => console.error('✗ Baileys clubes:', err.message));
    // WhatsApp propio de torneos/escuelas/profesores (Baileys): reabre las sesiones vinculadas
    require('./src/services/whatsappEntidad').iniciar().catch(err => console.error('✗ WhatsApp de entidades:', err.message));
    // MercadoPago OAuth: renovación proactiva de tokens por vencer (cada 12 h)
    try {
      require('./src/services/mercadopagoOAuth.service').iniciarRenovacionAutomatica(12);
    } catch (err) {
      console.error('✗ No se pudo iniciar la renovación de tokens de MercadoPago:', err.message);
    }
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`✗ El puerto ${PORT} ya está en uso. Cerrá el proceso anterior o cambiá PORT en .env`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  } catch (error) {
    console.error('✗ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

start();
