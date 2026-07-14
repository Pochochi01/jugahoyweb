/**
 * ecosystem.config.js — Configuración de PM2
 * Ejecutar desde la raíz del proyecto: pm2 start ecosystem.config.js
 * Documentación: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name:         'jugahoyweb',
      script:       './backend/server.js',
      cwd:          './',               // directorio raíz del proyecto
      instances:    1,                  // cambiar a 'max' si el VPS tiene varios núcleos
      exec_mode:    'fork',             // 'cluster' si instances > 1
      watch:        false,              // nunca watchear en producción
      max_memory_restart: '400M',       // reinicio automático si supera 400 MB

      env_production: {
        NODE_ENV:  'production',
        PORT:       5003,
        TZ:        'America/Argentina/Buenos_Aires',   // huso horario Argentina (GMT-3)
        // El resto de variables se carga del archivo .env ubicado en backend/
      },

      // Logs
      out_file:    './logs/out.log',
      error_file:  './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:  true,
    },
  ],
};
