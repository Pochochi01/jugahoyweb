const { Sequelize } = require('sequelize');

const isProd = process.env.NODE_ENV === 'production';

// En producción la mayoría de los proveedores cloud (PlanetScale, RDS, Clever Cloud, etc.)
// requieren SSL. Activar con DB_SSL=true en .env.production.
const sslOptions = isProd && process.env.DB_SSL === 'true'
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

const sequelize = new Sequelize(
  process.env.DB_NAME     || 'jugahoyweb',
  process.env.DB_USER     || 'root',
  process.env.DB_PASSWORD || '',
  {
    host:    process.env.DB_HOST || 'localhost',
    port:    parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',

    // Log de queries solo en desarrollo (evita ruido y datos sensibles en logs de prod)
    logging: isProd ? false : false,

    pool: {
      max:     parseInt(process.env.DB_POOL_MAX || (isProd ? '20' : '5')),
      min:     parseInt(process.env.DB_POOL_MIN || (isProd ? '5'  : '0')),
      acquire: 30000,   // ms esperando para obtener conexión antes de error
      idle:    10000,   // ms que una conexión puede estar inactiva antes de cerrar
    },

    dialectOptions: sslOptions,

    define: { underscored: true, timestamps: true },
  }
);

module.exports = sequelize;
