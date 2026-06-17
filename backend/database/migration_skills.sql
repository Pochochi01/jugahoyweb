-- ═══════════════════════════════════════════════════════════════
--  JugaHoyWeb — Migración: agregar skills de autenticación
--  Ejecutar UNA SOLA VEZ:
--    mysql -u root -p jugahoyweb < backend/database/migration_skills.sql
--
--  Qué hace:
--   1. Agrega google_id y avatar_url a la tabla users
--   2. Hace nullable la columna password (usuarios OAuth no tienen contraseña)
--   3. Crea tabla tokens   (reset-password, verificación email, OTP SMS)
--   4. Crea tabla contacts (mensajes de contacto)
--   5. Crea tabla terminos (versiones de T&C)
--   6. Crea tabla terms_aceptacion (registro de aceptaciones)
--   7. Inserta la versión 1.0 de los términos
-- ═══════════════════════════════════════════════════════════════

USE jugahoyweb;

-- ── 1. Tabla users: nuevas columnas para OAuth ────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id  VARCHAR(120) DEFAULT NULL AFTER telefono,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL AFTER google_id;

-- Índice para búsquedas por google_id (login con Google)
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_google_id (google_id);

-- Hacemos password nullable: los usuarios OAuth no tienen contraseña local
ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL DEFAULT NULL;

-- ── 2. Tabla tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT           NOT NULL,
  token       VARCHAR(255)  NOT NULL,
  tipo        ENUM('reset_password', 'email_verificacion', 'otp_phone') NOT NULL,
  expira_en   DATETIME      NOT NULL,
  usado       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uq_token (token),
  INDEX       idx_usuario_tipo (usuario_id, tipo),
  CONSTRAINT  fk_tokens_usuario
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Tabla contacts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL,
  telefono    VARCHAR(25)   DEFAULT NULL,
  asunto      VARCHAR(200)  DEFAULT NULL,
  mensaje     TEXT          NOT NULL,
  ip_origen   VARCHAR(45)   DEFAULT NULL,
  leido       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Tabla terminos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminos (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  version     VARCHAR(20)   NOT NULL UNIQUE,
  contenido   LONGTEXT      NOT NULL,
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. Tabla terms_aceptacion ─────────────────────────────────
CREATE TABLE IF NOT EXISTS terms_aceptacion (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT           NOT NULL,
  version     VARCHAR(20)   NOT NULL,
  ip          VARCHAR(45)   DEFAULT NULL,
  user_agent  VARCHAR(500)  DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uq_usuario_version (usuario_id, version),
  CONSTRAINT  fk_terms_usuario
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. Versión inicial de Términos y Condiciones ──────────────
INSERT IGNORE INTO terminos (version, contenido, activo) VALUES (
  '1.0',
  'TÉRMINOS Y CONDICIONES DE USO — JugaHoy v1.0\n\nÚltima actualización: 2026-06-16\n\n1. ACEPTACIÓN\nAl registrarte y usar JugaHoy aceptás estos términos en su totalidad.\n\n2. USO DEL SERVICIO\nJugaHoy es una plataforma de reservas de canchas deportivas. Queda prohibido el uso indebido, abusivo o que perjudique a otros usuarios o complejos.\n\n3. CUENTAS DE USUARIO\nSos responsable de mantener la confidencialidad de tu contraseña y de toda actividad realizada desde tu cuenta.\n\n4. RESERVAS\nLas reservas están sujetas a disponibilidad y confirmación por parte del complejo. El incumplimiento reiterado puede resultar en la suspensión de la cuenta.\n\n5. PRIVACIDAD\nTus datos personales se tratan conforme a nuestra Política de Privacidad. No los compartimos con terceros sin tu consentimiento, excepto cuando sea requerido por ley.\n\n6. PAGOS\nLos precios y métodos de pago son definidos por cada complejo. JugaHoy no procesa pagos directamente en todos los casos.\n\n7. MODIFICACIONES\nNos reservamos el derecho de modificar estos términos. Te notificaremos con al menos 15 días de anticipación ante cambios sustanciales.\n\n8. CONTACTO\nPara consultas: soporte@jugahoy.com.ar',
  1
);
