'use strict';
/**
 * Módulo GYM / FITNESS CENTER.
 *
 * Multiempresa: la "empresa" es el complejo (complexes.id = complex_id en todas las
 * tablas); las sucursales son gym_sucursales dentro del complejo.
 * Tienda e inventario reutilizan la Cantina/Almacén existente (cantina_productos,
 * cantina_ventas, cantina_movimientos); los cobros entran a la caja (cash_transactions).
 *
 * 3FN: catálogos (sucursales, actividades, planes) separados de los hechos
 * (membresías, pagos, accesos, asistencias, reservas); planes↔actividades en tabla puente.
 */
const TIPOS = ['libre', 'musculacion', 'funcional', 'crossfit', 'spinning', 'natacion', 'artes_marciales', 'personalizado'];
const ts = (S) => ({
  created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
});
const fk = (S, model, { allowNull = false, onDelete = 'CASCADE' } = {}) =>
  ({ type: S.INTEGER, allowNull, references: { model, key: 'id' }, onUpdate: 'CASCADE', onDelete });

module.exports = {
  async up(qi, S) {
    const existentes = await qi.showAllTables();
    const crear = async (tabla, cols, indices = []) => {
      if (existentes.includes(tabla)) return;
      await qi.createTable(tabla, cols);
      for (const [campos, opts] of indices) await qi.addIndex(tabla, campos, opts || {});
    };
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true };
    const complex = fk(S, 'complexes');
    const sucursal = fk(S, 'gym_sucursales', { allowNull: true, onDelete: 'SET NULL' });

    // ── Habilitación del módulo por complejo ──
    const cols = await qi.describeTable('complexes');
    if (!cols.modulo_gym) await qi.addColumn('complexes', 'modulo_gym', { type: S.BOOLEAN, allowNull: false, defaultValue: false });

    await crear('gym_config', {
      complex_id: { ...complex, primaryKey: true },
      dias_gracia: { type: S.INTEGER, allowNull: false, defaultValue: 5 },          // días tras el vencimiento antes de "moroso"
      exigir_apto_medico: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      recibo_prefijo: { type: S.STRING(10), allowNull: false, defaultValue: 'G' },
      proximo_recibo: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      nutricion_habilitada: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts(S),
    });

    await crear('gym_sucursales', {
      id, complex_id: complex,
      nombre: { type: S.STRING(100), allowNull: false },
      direccion: S.STRING(200), telefono: S.STRING(30),
      activa: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['complex_id']]]);

    await crear('gym_actividades', {
      id, complex_id: complex,
      nombre: { type: S.STRING(100), allowNull: false },
      tipo: { type: S.ENUM(...TIPOS), allowNull: false, defaultValue: 'libre' },
      descripcion: S.STRING(255), color: S.STRING(9),
      activa: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['complex_id', 'activa']]]);

    await crear('gym_planes', {
      id, complex_id: complex,
      nombre: { type: S.STRING(100), allowNull: false },
      tipo: { type: S.ENUM(...TIPOS), allowNull: false, defaultValue: 'libre' },
      periodo: { type: S.ENUM('diario', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual'), allowNull: false, defaultValue: 'mensual' },
      precio: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      descuento_pct: { type: S.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      hora_desde: S.STRING(5), hora_hasta: S.STRING(5),                            // franja de acceso (null = libre)
      clases_por_semana: S.INTEGER,                                                 // null = ilimitado
      descripcion: S.STRING(255),
      activo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['complex_id', 'activo']]]);

    await crear('gym_plan_actividades', {
      plan_id: { ...fk(S, 'gym_planes'), primaryKey: true },
      actividad_id: { ...fk(S, 'gym_actividades'), primaryKey: true },
    });

    await crear('gym_profesores', {
      id, complex_id: complex,
      profesor_id: fk(S, 'profesores', { allowNull: true, onDelete: 'SET NULL' }), // vínculo opcional con el módulo Profesores
      nombre: { type: S.STRING(100), allowNull: false }, apellido: { type: S.STRING(100), allowNull: false },
      dni: S.STRING(15), telefono: S.STRING(30), email: S.STRING(150),
      rol: { type: S.ENUM('profesor', 'personal_trainer', 'nutricionista'), allowNull: false, defaultValue: 'profesor' },
      especialidad: S.STRING(150), certificaciones: S.TEXT,
      valor_hora: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      comision_pct: { type: S.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      activo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['complex_id', 'activo']]]);

    await crear('gym_profesor_horarios', {
      id, profesor_id: fk(S, 'gym_profesores'), sucursal_id: sucursal,
      dia_semana: { type: S.TINYINT, allowNull: false },                            // 0 = domingo
      hora_desde: { type: S.STRING(5), allowNull: false }, hora_hasta: { type: S.STRING(5), allowNull: false },
      ...ts(S),
    }, [[['profesor_id']]]);

    await crear('gym_socios', {
      id, complex_id: complex, sucursal_id: sucursal,
      foto_url: S.STRING(255),
      nombre: { type: S.STRING(100), allowNull: false }, apellido: { type: S.STRING(100), allowNull: false },
      dni: { type: S.STRING(15), allowNull: false },
      fecha_nacimiento: S.DATEONLY, sexo: S.ENUM('F', 'M', 'X'),
      direccion: S.STRING(200), localidad: S.STRING(100), provincia: S.STRING(100),
      telefono: S.STRING(30), whatsapp: S.STRING(30), email: S.STRING(150),
      emergencia_nombre: S.STRING(150), emergencia_telefono: S.STRING(30),
      obra_social: S.STRING(100), observaciones: S.TEXT,
      estado: { type: S.ENUM('activo', 'suspendido', 'moroso', 'baja', 'congelado'), allowNull: false, defaultValue: 'activo' },
      codigo: { type: S.STRING(12), allowNull: false },                             // código de acceso corto
      qr_token: { type: S.STRING(64), allowNull: false },                           // QR + link al portal del socio
      fecha_alta: { type: S.DATEONLY, allowNull: false },
      fecha_baja: S.DATEONLY,
      ...ts(S),
    }, [
      [['complex_id', 'dni'], { unique: true, name: 'uq_gym_socio_dni' }],
      [['complex_id', 'codigo'], { unique: true, name: 'uq_gym_socio_codigo' }],
      [['qr_token'], { unique: true, name: 'uq_gym_socio_qr' }],
      [['complex_id', 'estado']],
      [['complex_id', 'apellido', 'nombre']],
    ]);

    await crear('gym_aptos_medicos', {
      id, socio_id: fk(S, 'gym_socios'),
      fecha_emision: { type: S.DATEONLY, allowNull: false }, fecha_vencimiento: { type: S.DATEONLY, allowNull: false },
      profesional: S.STRING(150), archivo_url: S.STRING(255), observaciones: S.STRING(255),
      ...ts(S),
    }, [[['socio_id', 'fecha_vencimiento']]]);

    await crear('gym_socio_historial', {
      id, complex_id: complex, socio_id: fk(S, 'gym_socios'),
      tipo: { type: S.ENUM('alta', 'baja', 'renovacion', 'pago', 'estado', 'plan', 'rutina', 'evaluacion', 'apto', 'otro'), allowNull: false },
      descripcion: { type: S.STRING(255), allowNull: false },
      usuario_id: S.INTEGER,
      ...ts(S),
    }, [[['socio_id', 'created_at']]]);

    await crear('gym_membresias', {
      id, complex_id: complex, socio_id: fk(S, 'gym_socios'), plan_id: fk(S, 'gym_planes', { onDelete: 'RESTRICT' }),
      fecha_inicio: { type: S.DATEONLY, allowNull: false }, fecha_fin: { type: S.DATEONLY, allowNull: false },
      precio: { type: S.DECIMAL(10, 2), allowNull: false }, descuento: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total: { type: S.DECIMAL(10, 2), allowNull: false },
      estado: { type: S.ENUM('vigente', 'vencida', 'cancelada', 'congelada'), allowNull: false, defaultValue: 'vigente' },
      renovacion_de_id: { type: S.INTEGER, allowNull: true },
      usuario_id: S.INTEGER,
      ...ts(S),
    }, [[['socio_id', 'fecha_fin']], [['complex_id', 'estado', 'fecha_fin']]]);

    await crear('gym_pagos', {
      id, complex_id: complex, socio_id: fk(S, 'gym_socios'),
      membresia_id: fk(S, 'gym_membresias', { allowNull: true, onDelete: 'SET NULL' }),
      numero_recibo: { type: S.STRING(20), allowNull: false },
      concepto: { type: S.STRING(200), allowNull: false },
      monto: { type: S.DECIMAL(10, 2), allowNull: false },
      metodo: { type: S.ENUM('efectivo', 'transferencia', 'debito', 'credito', 'mercadopago'), allowNull: false },
      fecha: { type: S.DATEONLY, allowNull: false },
      anulado: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      cash_transaction_id: S.INTEGER, usuario_id: S.INTEGER, sucursal_id: sucursal,
      ...ts(S),
    }, [[['complex_id', 'numero_recibo'], { unique: true, name: 'uq_gym_recibo' }], [['complex_id', 'fecha']], [['socio_id']]]);

    await crear('gym_accesos', {
      id, complex_id: complex, sucursal_id: sucursal,
      socio_id: fk(S, 'gym_socios', { allowNull: true, onDelete: 'SET NULL' }),
      metodo: { type: S.ENUM('qr', 'codigo', 'dni', 'manual'), allowNull: false },
      dato: S.STRING(64),                                                           // lo ingresado (si no se encontró el socio)
      resultado: { type: S.ENUM('permitido', 'denegado'), allowNull: false },
      motivo: S.STRING(255), usuario_id: S.INTEGER,
      ...ts(S),
    }, [[['complex_id', 'created_at']], [['socio_id', 'created_at']]]);

    await crear('gym_clases', {
      id, complex_id: complex, sucursal_id: sucursal,
      actividad_id: fk(S, 'gym_actividades', { onDelete: 'RESTRICT' }),
      profesor_id: fk(S, 'gym_profesores', { allowNull: true, onDelete: 'SET NULL' }),
      fecha: { type: S.DATEONLY, allowNull: false }, hora_inicio: { type: S.STRING(5), allowNull: false },
      duracion_min: { type: S.INTEGER, allowNull: false, defaultValue: 60 },
      cupo: { type: S.INTEGER, allowNull: false, defaultValue: 20 },
      estado: { type: S.ENUM('disponible', 'completa', 'cancelada', 'finalizada'), allowNull: false, defaultValue: 'disponible' },
      notas: S.STRING(255),
      ...ts(S),
    }, [[['complex_id', 'fecha', 'hora_inicio']], [['profesor_id', 'fecha']]]);

    await crear('gym_reservas', {
      id, clase_id: fk(S, 'gym_clases'), socio_id: fk(S, 'gym_socios'),
      estado: { type: S.ENUM('reservada', 'espera', 'cancelada', 'asistio', 'ausente'), allowNull: false, defaultValue: 'reservada' },
      origen: { type: S.ENUM('panel', 'socio'), allowNull: false, defaultValue: 'panel' },
      ...ts(S),
    }, [[['clase_id', 'socio_id'], { unique: true, name: 'uq_gym_reserva' }], [['socio_id', 'estado']]]);

    await crear('gym_asistencias', {
      id, complex_id: complex, sucursal_id: sucursal, socio_id: fk(S, 'gym_socios'),
      clase_id: fk(S, 'gym_clases', { allowNull: true, onDelete: 'SET NULL' }),
      actividad_id: fk(S, 'gym_actividades', { allowNull: true, onDelete: 'SET NULL' }),
      profesor_id: fk(S, 'gym_profesores', { allowNull: true, onDelete: 'SET NULL' }),
      fecha: { type: S.DATEONLY, allowNull: false }, hora: { type: S.STRING(5), allowNull: false },
      origen: { type: S.ENUM('acceso', 'clase', 'manual'), allowNull: false, defaultValue: 'acceso' },
      ...ts(S),
    }, [[['complex_id', 'fecha']], [['socio_id', 'fecha']]]);

    await crear('gym_rutinas', {
      id, complex_id: complex,
      socio_id: fk(S, 'gym_socios', { allowNull: true }),                           // null = plantilla
      profesor_id: fk(S, 'gym_profesores', { allowNull: true, onDelete: 'SET NULL' }),
      nombre: { type: S.STRING(150), allowNull: false }, objetivo: S.STRING(255),
      version_actual: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      activa: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['complex_id', 'socio_id']]]);

    await crear('gym_rutina_versiones', {
      id, rutina_id: fk(S, 'gym_rutinas'),
      version: { type: S.INTEGER, allowNull: false }, notas: S.STRING(255), usuario_id: S.INTEGER,
      ...ts(S),
    }, [[['rutina_id', 'version'], { unique: true, name: 'uq_gym_rutina_version' }]]);

    await crear('gym_rutina_ejercicios', {
      id, version_id: fk(S, 'gym_rutina_versiones'),
      dia: { type: S.STRING(30), allowNull: false, defaultValue: 'Día 1' },
      orden: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      nombre: { type: S.STRING(150), allowNull: false },
      series: S.INTEGER, repeticiones: S.STRING(20), peso: S.STRING(20), descanso_seg: S.INTEGER, notas: S.STRING(255),
      ...ts(S),
    }, [[['version_id', 'dia', 'orden']]]);

    await crear('gym_rutina_comentarios', {
      id, rutina_id: fk(S, 'gym_rutinas'),
      autor: { type: S.STRING(150), allowNull: false }, texto: { type: S.TEXT, allowNull: false },
      ...ts(S),
    }, [[['rutina_id']]]);

    await crear('gym_evaluaciones', {
      id, complex_id: complex, socio_id: fk(S, 'gym_socios'),
      profesor_id: fk(S, 'gym_profesores', { allowNull: true, onDelete: 'SET NULL' }),
      fecha: { type: S.DATEONLY, allowNull: false },
      peso: S.DECIMAL(5, 2), altura: S.DECIMAL(5, 2), imc: S.DECIMAL(5, 2), grasa_pct: S.DECIMAL(5, 2),
      masa_muscular: S.DECIMAL(5, 2), cintura: S.DECIMAL(5, 1), cadera: S.DECIMAL(5, 1), pecho: S.DECIMAL(5, 1),
      brazo: S.DECIMAL(5, 1), pierna: S.DECIMAL(5, 1), notas: S.STRING(255),
      ...ts(S),
    }, [[['socio_id', 'fecha']]]);

    await crear('gym_nutricion_planes', {
      id, complex_id: complex, socio_id: fk(S, 'gym_socios'),
      profesional_id: fk(S, 'gym_profesores', { allowNull: true, onDelete: 'SET NULL' }),
      fecha_inicio: { type: S.DATEONLY, allowNull: false }, objetivo: S.STRING(255),
      plan: { type: S.TEXT, allowNull: false }, observaciones: S.TEXT,
      activo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...ts(S),
    }, [[['socio_id']]]);

    await crear('gym_nutricion_seguimientos', {
      id, plan_id: fk(S, 'gym_nutricion_planes'),
      fecha: { type: S.DATEONLY, allowNull: false }, peso: S.DECIMAL(5, 2), observaciones: S.TEXT,
      ...ts(S),
    }, [[['plan_id', 'fecha']]]);

    await crear('gym_equipos', {
      id, complex_id: complex, sucursal_id: sucursal,
      nombre: { type: S.STRING(150), allowNull: false },
      tipo: { type: S.ENUM('maquina', 'cinta', 'bicicleta', 'equipamiento', 'otro'), allowNull: false, defaultValue: 'maquina' },
      marca: S.STRING(100), modelo: S.STRING(100), nro_serie: S.STRING(100),
      fecha_compra: S.DATEONLY, garantia_hasta: S.DATEONLY,
      frecuencia_mant_dias: S.INTEGER, ultimo_mantenimiento: S.DATEONLY,
      estado: { type: S.ENUM('operativo', 'mantenimiento', 'fuera_servicio', 'baja'), allowNull: false, defaultValue: 'operativo' },
      ...ts(S),
    }, [[['complex_id', 'estado']]]);

    await crear('gym_equipo_eventos', {
      id, equipo_id: fk(S, 'gym_equipos'),
      tipo: { type: S.ENUM('mantenimiento', 'reparacion', 'garantia'), allowNull: false },
      fecha: { type: S.DATEONLY, allowNull: false }, descripcion: { type: S.STRING(255), allowNull: false },
      costo: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }, proveedor: S.STRING(150),
      ...ts(S),
    }, [[['equipo_id', 'fecha']]]);

    // Roles del gimnasio con permisos granulares (configurables por complejo)
    await crear('gym_roles', {
      id, complex_id: complex,
      clave: { type: S.STRING(30), allowNull: false }, nombre: { type: S.STRING(60), allowNull: false },
      permisos: { type: S.JSON, allowNull: false },                                 // { recurso: ['ver','crear',...] }
      ...ts(S),
    }, [[['complex_id', 'clave'], { unique: true, name: 'uq_gym_rol' }]]);

    await crear('gym_auditoria', {
      id: { type: S.BIGINT, primaryKey: true, autoIncrement: true },
      complex_id: complex, sucursal_id: { type: S.INTEGER, allowNull: true },
      usuario_id: S.INTEGER, usuario: S.STRING(150),
      accion: { type: S.STRING(30), allowNull: false }, entidad: { type: S.STRING(40), allowNull: false },
      entidad_id: S.INTEGER, detalle: S.JSON, ip: S.STRING(45),
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
    }, [[['complex_id', 'created_at']], [['complex_id', 'entidad', 'entidad_id']]]);
  },

  async down(qi) {
    for (const t of ['gym_auditoria', 'gym_roles', 'gym_equipo_eventos', 'gym_equipos', 'gym_nutricion_seguimientos', 'gym_nutricion_planes',
      'gym_evaluaciones', 'gym_rutina_comentarios', 'gym_rutina_ejercicios', 'gym_rutina_versiones', 'gym_rutinas', 'gym_asistencias',
      'gym_reservas', 'gym_clases', 'gym_accesos', 'gym_pagos', 'gym_membresias', 'gym_socio_historial', 'gym_aptos_medicos', 'gym_socios',
      'gym_profesor_horarios', 'gym_profesores', 'gym_plan_actividades', 'gym_planes', 'gym_actividades', 'gym_sucursales', 'gym_config']) {
      await qi.dropTable(t).catch(() => {});
    }
    await qi.removeColumn('complexes', 'modulo_gym').catch(() => {});
  },
};
