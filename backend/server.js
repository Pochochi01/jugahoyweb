require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ── Zona horaria: Argentina (GMT-3) ──────────────────────────
// Debe fijarse ANTES de requerir modelos/app para que todo `new Date()` del
// proceso opere en hora local argentina. Se puede sobreescribir con TZ en .env.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const app = require('./src/app');
const { sequelize } = require('./src/models');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✓ Conexión a la base de datos establecida.');
    await sequelize.sync({ alter: false });
    console.log('✓ Modelos sincronizados.');
    const server = app.listen(PORT, () => {
      console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
    });
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
