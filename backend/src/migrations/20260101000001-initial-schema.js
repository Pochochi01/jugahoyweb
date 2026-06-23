'use strict';
/**
 * Migration 001 — Esquema inicial completo
 * Crea TODAS las tablas base si no existen. Segura para ejecutar sobre una BD existente.
 * Tablas core: users, complexes, fields, agenda, operations, cash_registers,
 *              cash_transactions, collaborators, images, subscriptions, notifications
 */

const TS = (S) => ({
  created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.showAllTables();
    const skip = (t) => existing.includes(t);

    // ── users ──────────────────────────────────────────────────────
    if (!skip('users')) {
      await queryInterface.createTable('users', {
        id       : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        nombre   : { type: Sequelize.STRING(100), allowNull: false },
        apellido : { type: Sequelize.STRING(100), allowNull: false },
        email    : { type: Sequelize.STRING(150), allowNull: false, unique: true },
        password : { type: Sequelize.STRING(255), allowNull: true,  defaultValue: null },
        telefono : { type: Sequelize.STRING(20)  },
        google_id : { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
        avatar_url: { type: Sequelize.STRING(500), allowNull: true, defaultValue: null },
        rol: {
          type: Sequelize.ENUM('general_admin', 'complex_admin', 'collaborator', 'player'),
          defaultValue: 'player',
        },
        activo: { type: Sequelize.BOOLEAN, defaultValue: true },
        ...TS(Sequelize),
      });
    }

    // ── complexes ──────────────────────────────────────────────────
    if (!skip('complexes')) {
      await queryInterface.createTable('complexes', {
        id          : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        nombre      : { type: Sequelize.STRING(150), allowNull: false },
        descripcion : { type: Sequelize.TEXT },
        direccion   : { type: Sequelize.STRING(255), allowNull: false },
        ciudad      : { type: Sequelize.STRING(100) },
        provincia   : { type: Sequelize.STRING(100) },
        telefono    : { type: Sequelize.STRING(20)  },
        email       : { type: Sequelize.STRING(150) },
        prestaciones       : { type: Sequelize.JSON },
        logo_url           : { type: Sequelize.STRING(255) },
        banner_url         : { type: Sequelize.STRING(255) },
        owner_id           : { type: Sequelize.INTEGER, allowNull: false },
        activo             : { type: Sequelize.BOOLEAN, defaultValue: true },
        mercadopago_token  : { type: Sequelize.STRING(255) },
        cuentas_bancarias  : { type: Sequelize.JSON },
        ...TS(Sequelize),
      });
    }

    // ── fields ─────────────────────────────────────────────────────
    if (!skip('fields')) {
      await queryInterface.createTable('fields', {
        id         : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id : { type: Sequelize.INTEGER, allowNull: false },
        nombre     : { type: Sequelize.STRING(100), allowNull: false },
        deporte: {
          type: Sequelize.ENUM('futbol', 'padel', 'tenis', 'basquet', 'voley', 'otro'),
          allowNull: false,
        },
        piso: { type: Sequelize.ENUM('cesped_sintetico', 'cemento', 'parquet', 'tierra', 'otro') },
        dimensiones           : { type: Sequelize.STRING(50) },
        duracion_turno        : { type: Sequelize.INTEGER, defaultValue: 60 },
        duraciones_permitidas : { type: Sequelize.JSON, defaultValue: [60] },
        precios_por_duracion  : { type: Sequelize.JSON, defaultValue: {} },
        techada               : { type: Sequelize.BOOLEAN, defaultValue: false },
        precio_base           : { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        activa                : { type: Sequelize.BOOLEAN, defaultValue: true },
        hora_apertura         : { type: Sequelize.STRING(5), defaultValue: '08:00' },
        hora_cierre           : { type: Sequelize.STRING(5), defaultValue: '02:00' },
        imagen_url            : { type: Sequelize.STRING(255) },
        ...TS(Sequelize),
      });
    }

    // ── agenda ─────────────────────────────────────────────────────
    if (!skip('agenda')) {
      await queryInterface.createTable('agenda', {
        id       : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        field_id : { type: Sequelize.INTEGER, allowNull: false },
        user_id  : { type: Sequelize.INTEGER },
        fecha    : { type: Sequelize.DATEONLY, allowNull: false },
        hora_inicio : { type: Sequelize.TIME, allowNull: false },
        hora_fin    : { type: Sequelize.TIME, allowNull: false },
        estado: {
          type: Sequelize.ENUM('disponible', 'reservado', 'confirmado', 'cancelado', 'bloqueado'),
          defaultValue: 'disponible',
        },
        precio      : { type: Sequelize.DECIMAL(10, 2) },
        metodo_pago : { type: Sequelize.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta') },
        notas       : { type: Sequelize.TEXT },
        origen      : { type: Sequelize.ENUM('web', 'manual', 'telefono'), defaultValue: 'web' },
        ...TS(Sequelize),
      });
    }

    // ── operations ─────────────────────────────────────────────────
    if (!skip('operations')) {
      await queryInterface.createTable('operations', {
        id         : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id : { type: Sequelize.INTEGER, allowNull: false },
        tipo: {
          type: Sequelize.ENUM('reserva', 'cancelacion', 'confirmacion', 'pago', 'ajuste'),
          allowNull: false,
        },
        descripcion : { type: Sequelize.TEXT },
        agenda_id   : { type: Sequelize.INTEGER },
        usuario_id  : { type: Sequelize.INTEGER },
        monto       : { type: Sequelize.DECIMAL(10, 2) },
        fecha       : { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        ...TS(Sequelize),
      });
    }

    // ── cash_registers ─────────────────────────────────────────────
    if (!skip('cash_registers')) {
      await queryInterface.createTable('cash_registers', {
        id             : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id     : { type: Sequelize.INTEGER, allowNull: false },
        fecha_apertura : { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        fecha_cierre   : { type: Sequelize.DATE },
        monto_inicial  : { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        monto_final    : { type: Sequelize.DECIMAL(10, 2) },
        estado         : { type: Sequelize.ENUM('abierta', 'cerrada'), defaultValue: 'abierta' },
        usuario_apertura_id : { type: Sequelize.INTEGER },
        usuario_cierre_id   : { type: Sequelize.INTEGER },
        notas               : { type: Sequelize.TEXT },
        ...TS(Sequelize),
      });
    }

    // ── cash_transactions ──────────────────────────────────────────
    if (!skip('cash_transactions')) {
      await queryInterface.createTable('cash_transactions', {
        id               : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        cash_register_id : { type: Sequelize.INTEGER, allowNull: false },
        tipo             : { type: Sequelize.ENUM('ingreso', 'egreso'), allowNull: false },
        concepto         : { type: Sequelize.STRING(255), allowNull: false },
        monto            : { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        metodo_pago: {
          type: Sequelize.ENUM('efectivo', 'transferencia', 'mercadopago', 'tarjeta'),
          defaultValue: 'efectivo',
        },
        categoria  : { type: Sequelize.STRING(100) },
        agenda_id  : { type: Sequelize.INTEGER },
        usuario_id : { type: Sequelize.INTEGER },
        fecha      : { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        notas      : { type: Sequelize.TEXT },
        ...TS(Sequelize),
      });
    }

    // ── collaborators ──────────────────────────────────────────────
    if (!skip('collaborators')) {
      await queryInterface.createTable('collaborators', {
        id         : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id : { type: Sequelize.INTEGER, allowNull: false },
        user_id    : { type: Sequelize.INTEGER, allowNull: false },
        nombre     : { type: Sequelize.STRING(100) },
        apellido   : { type: Sequelize.STRING(100) },
        permisos   : { type: Sequelize.JSON },
        activo     : { type: Sequelize.BOOLEAN, defaultValue: true },
        ...TS(Sequelize),
      });
    }

    // ── images ─────────────────────────────────────────────────────
    if (!skip('images')) {
      await queryInterface.createTable('images', {
        id    : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        url   : { type: Sequelize.STRING(255), allowNull: false },
        tipo  : {
          type: Sequelize.ENUM('hero_slider', 'hero_banner', 'complejo', 'cancha', 'general'),
          defaultValue: 'general',
        },
        alt_text                    : { type: Sequelize.STRING(255) },
        orden                       : { type: Sequelize.INTEGER, defaultValue: 0 },
        activa                      : { type: Sequelize.BOOLEAN, defaultValue: true },
        editable_por_general_admin  : { type: Sequelize.BOOLEAN, defaultValue: true },
        ...TS(Sequelize),
      });
    }

    // ── subscriptions ──────────────────────────────────────────────
    if (!skip('subscriptions')) {
      await queryInterface.createTable('subscriptions', {
        id               : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        complex_id       : { type: Sequelize.INTEGER, allowNull: false, unique: true },
        precio_mensual   : { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        estado           : { type: Sequelize.ENUM('activo', 'inactivo'), defaultValue: 'activo' },
        fecha_inicio     : { type: Sequelize.DATEONLY },
        fecha_pago       : { type: Sequelize.DATEONLY },
        fecha_vencimiento: { type: Sequelize.DATEONLY },
        notas            : { type: Sequelize.TEXT },
        created_by       : { type: Sequelize.INTEGER },
        ...TS(Sequelize),
      });
    }

    // ── notifications ──────────────────────────────────────────────
    if (!skip('notifications')) {
      await queryInterface.createTable('notifications', {
        id      : { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id : { type: Sequelize.INTEGER, allowNull: false },
        tipo: {
          type: Sequelize.ENUM('nueva_reserva', 'reserva_confirmada', 'reserva_rechazada'),
          allowNull: false,
        },
        titulo     : { type: Sequelize.STRING(200), allowNull: false },
        mensaje    : { type: Sequelize.TEXT },
        leida      : { type: Sequelize.BOOLEAN, defaultValue: false },
        booking_id : { type: Sequelize.INTEGER },
        ...TS(Sequelize),
      });
    }
  },

  async down(queryInterface) {
    // DESTRUCTIVO — elimina datos. Solo usar en entorno de desarrollo.
    const tables = [
      'notifications', 'subscriptions', 'images', 'collaborators',
      'cash_transactions', 'cash_registers', 'operations', 'agenda',
      'fields', 'complexes', 'users',
    ];
    for (const t of tables) await queryInterface.dropTable(t, { cascade: true });
  },
};
