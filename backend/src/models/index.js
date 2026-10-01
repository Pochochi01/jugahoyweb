const sequelize = require('../config/database');
const User = require('./User');
const Complex = require('./Complex');
const Field = require('./Field');
const Agenda = require('./Agenda');
const Operation = require('./Operation');
const CashRegister = require('./CashRegister');
const CashTransaction = require('./CashTransaction');
const Collaborator = require('./Collaborator');
const Image = require('./Image');
const TimeSlot = require('./TimeSlot');
const Booking = require('./Booking');
const Subscription = require('./Subscription');
const Notification = require('./Notification');
// ── Skills agregados ──────────────────────────────────────────
const Token           = require('./Token');
const Contact         = require('./Contact');
const TermsVersion    = require('./TermsVersion');
const TermsAcceptance = require('./TermsAcceptance');
const Invite          = require('./Invite');
const Localidad       = require('./Localidad');
const Favorite        = require('./Favorite');
const PushSubscription = require('./PushSubscription');
const ClubIntegration  = require('./ClubIntegration');
const Blacklist        = require('./Blacklist');
const CantinaProducto       = require('./CantinaProducto');
const CantinaVenta          = require('./CantinaVenta');
const CantinaDetalleVenta   = require('./CantinaDetalleVenta');
const CantinaMovimiento     = require('./CantinaMovimiento');
const RecurringBooking      = require('./RecurringBooking');
const BookingConsumo        = require('./BookingConsumo');
const Waitlist              = require('./Waitlist');
const WaConversation        = require('./WaConversation');
const WaTemplate            = require('./WaTemplate');
const {
  CantinaProveedor, CantinaCliente, CantinaPedidoProveedor, CantinaPedidoCliente, CantinaItemPedido,
  CantinaProductoProveedor,
} = require('./CantinaPedidos');
// Torneos de pádel
const Torneo            = require('./Torneo');
const TorneoOrganizador = require('./TorneoOrganizador');
const TorneoCancha      = require('./TorneoCancha');
const TorneoZona        = require('./TorneoZona');
const TorneoPareja      = require('./TorneoPareja');
const TorneoJugador     = require('./TorneoJugador');
const TorneoPartido     = require('./TorneoPartido');
const TorneoResultado   = require('./TorneoResultado');
const TorneoTicket      = require('./TorneoTicket');
const TorneoTablaPosicion = require('./TorneoTablaPosicion');
const RankingJugador    = require('./RankingJugador');
// Profesores de pádel
const Profesor          = require('./Profesor');
const ProfesorCancha    = require('./ProfesorCancha');
const HorarioProfesor   = require('./HorarioProfesor');
const Alumno            = require('./Alumno');
// Escuela de fútbol
const {
  EscuelaConfig, EscuelaCategoria, EscuelaAlumno, EscuelaProfesorCategoria,
  EscuelaHorario, EscuelaPago, EscuelaAviso,
} = require('./Escuela');

// User ↔ Complex
User.hasMany(Complex, { foreignKey: 'owner_id', as: 'complexes' });
Complex.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

// Complex ↔ Field
Complex.hasMany(Field, { foreignKey: 'complex_id', as: 'fields' });
Field.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// Field ↔ Agenda (legacy)
Field.hasMany(Agenda, { foreignKey: 'field_id', as: 'slots' });
Agenda.belongsTo(Field, { foreignKey: 'field_id', as: 'field' });
User.hasMany(Agenda, { foreignKey: 'user_id', as: 'reservations' });
Agenda.belongsTo(User, { foreignKey: 'user_id', as: 'player' });

// Field ↔ Booking
Field.hasMany(Booking, { foreignKey: 'field_id', as: 'bookings' });
Booking.belongsTo(Field, { foreignKey: 'field_id', as: 'field' });

// Field ↔ TimeSlot
Field.hasMany(TimeSlot, { foreignKey: 'field_id', as: 'timeSlots' });
TimeSlot.belongsTo(Field, { foreignKey: 'field_id', as: 'field' });

// Booking ↔ TimeSlot
Booking.hasMany(TimeSlot, { foreignKey: 'booking_id', as: 'timeSlots' });
TimeSlot.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });

// Complex ↔ Operation
Complex.hasMany(Operation, { foreignKey: 'complex_id', as: 'operations' });
Operation.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// User ↔ Operation
User.hasMany(Operation, { foreignKey: 'usuario_id', as: 'operationsCreated' });
Operation.belongsTo(User, { foreignKey: 'usuario_id', as: 'usuario' });

// Complex ↔ CashRegister
Complex.hasMany(CashRegister, { foreignKey: 'complex_id', as: 'cashRegisters' });
CashRegister.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// CashRegister ↔ CashTransaction
CashRegister.hasMany(CashTransaction, { foreignKey: 'cash_register_id', as: 'transactions' });
CashTransaction.belongsTo(CashRegister, { foreignKey: 'cash_register_id', as: 'cashRegister' });

// Complex ↔ Collaborator
Complex.hasMany(Collaborator, { foreignKey: 'complex_id', as: 'collaborators' });
Collaborator.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });
User.hasOne(Collaborator, { foreignKey: 'user_id', as: 'collaboratorProfile' });
Collaborator.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Complex ↔ Subscription
Complex.hasOne(Subscription, { foreignKey: 'complex_id', as: 'subscription' });
Subscription.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// User ↔ Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Asociaciones: skills ──────────────────────────────────────
User.hasMany(Token,           { foreignKey: 'usuario_id', as: 'tokens' });
Token.belongsTo(User,         { foreignKey: 'usuario_id', as: 'usuario' });

User.hasMany(TermsAcceptance, { foreignKey: 'usuario_id', as: 'termsAcceptances' });
TermsAcceptance.belongsTo(User, { foreignKey: 'usuario_id', as: 'usuario' });

// ── Player ↔ Complejo por defecto (vía invitación) ────────────
// Un jugador queda vinculado al complejo de la invitación que consumió.
User.belongsTo(Complex, { foreignKey: 'default_complex_id', as: 'defaultComplex' });
Complex.hasMany(User,   { foreignKey: 'default_complex_id', as: 'players' });

// ── Invite ────────────────────────────────────────────────────
Invite.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });
Invite.belongsTo(Field,   { foreignKey: 'field_id',   as: 'field' });
Invite.belongsTo(User,    { foreignKey: 'created_by', as: 'creator' });
Invite.belongsTo(User,    { foreignKey: 'player_id',  as: 'player' });
Complex.hasMany(Invite,   { foreignKey: 'complex_id', as: 'invites' });
Field.hasMany(Invite,     { foreignKey: 'field_id',   as: 'invites' });

// ── Favoritos: Player ↔ Complejo (N:N) ────────────────────────
User.belongsToMany(Complex, {
  through: Favorite, as: 'favoriteComplexes',
  foreignKey: 'player_id', otherKey: 'complex_id',
});
Complex.belongsToMany(User, {
  through: Favorite, as: 'favoritedBy',
  foreignKey: 'complex_id', otherKey: 'player_id',
});
User.hasMany(Favorite,    { foreignKey: 'player_id',  as: 'favorites' });
Favorite.belongsTo(User,  { foreignKey: 'player_id',  as: 'player' });
Favorite.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// ── Push subscriptions ────────────────────────────────────────
User.hasMany(PushSubscription,   { foreignKey: 'user_id', as: 'pushSubscriptions' });
PushSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Integraciones por club (multi-tenant) ─────────────────────
Complex.hasOne(ClubIntegration,    { foreignKey: 'club_id', as: 'integrations' });
ClubIntegration.belongsTo(Complex, { foreignKey: 'club_id', as: 'club' });

// ── Cantina ──
CantinaVenta.hasMany(CantinaDetalleVenta,   { foreignKey: 'venta_id', as: 'detalle', onDelete: 'CASCADE' });
CantinaDetalleVenta.belongsTo(CantinaVenta, { foreignKey: 'venta_id', as: 'venta' });
CantinaDetalleVenta.belongsTo(CantinaProducto, { foreignKey: 'producto_id', as: 'producto' });
CantinaProducto.hasMany(CantinaDetalleVenta,   { foreignKey: 'producto_id', as: 'ventas' });
CantinaProducto.hasMany(CantinaMovimiento,  { foreignKey: 'producto_id', as: 'movimientos', onDelete: 'CASCADE' });
CantinaMovimiento.belongsTo(CantinaProducto, { foreignKey: 'producto_id', as: 'producto' });

// ── Cantina: pedidos a proveedores / de clientes ──
CantinaProveedor.hasMany(CantinaPedidoProveedor, { foreignKey: 'proveedor_id', as: 'pedidos' });
CantinaPedidoProveedor.belongsTo(CantinaProveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
CantinaCliente.hasMany(CantinaPedidoCliente,     { foreignKey: 'cliente_id', as: 'pedidos' });
CantinaPedidoCliente.belongsTo(CantinaCliente,   { foreignKey: 'cliente_id', as: 'cliente' });
CantinaPedidoProveedor.hasMany(CantinaItemPedido, { foreignKey: 'pedido_proveedor_id', as: 'items', onDelete: 'CASCADE' });
CantinaPedidoCliente.hasMany(CantinaItemPedido,   { foreignKey: 'pedido_cliente_id',   as: 'items', onDelete: 'CASCADE' });
CantinaItemPedido.belongsTo(CantinaProducto,      { foreignKey: 'producto_id', as: 'producto' });
CantinaPedidoProveedor.belongsTo(User, { foreignKey: 'usuario_id', as: 'usuario' });
CantinaPedidoCliente.belongsTo(User,   { foreignKey: 'usuario_id', as: 'usuario' });
// Catálogo de precios por proveedor (N:N)
CantinaProveedor.hasMany(CantinaProductoProveedor, { foreignKey: 'proveedor_id', as: 'catalogo', onDelete: 'CASCADE' });
CantinaProducto.hasMany(CantinaProductoProveedor,  { foreignKey: 'producto_id', as: 'proveedores', onDelete: 'CASCADE' });
CantinaProductoProveedor.belongsTo(CantinaProveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
CantinaProductoProveedor.belongsTo(CantinaProducto,  { foreignKey: 'producto_id', as: 'producto' });

// ── Turnos fijos ──
RecurringBooking.belongsTo(Field, { foreignKey: 'field_id', as: 'field' });

// ── Consumos por turno ──
Booking.hasMany(BookingConsumo,   { foreignKey: 'booking_id', as: 'consumos', onDelete: 'CASCADE' });
BookingConsumo.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });
BookingConsumo.belongsTo(CantinaProducto, { foreignKey: 'producto_id', as: 'producto' });

// ── Lista de espera ──
Waitlist.belongsTo(Field,   { foreignKey: 'field_id',   as: 'field' });
Waitlist.belongsTo(Complex, { foreignKey: 'complex_id', as: 'complex' });

// ── Torneos de pádel ──
Complex.hasMany(Torneo,            { foreignKey: 'id_tenant', as: 'torneos' });
Torneo.belongsTo(Complex,          { foreignKey: 'id_tenant', as: 'club' });
Complex.hasMany(TorneoOrganizador, { foreignKey: 'id_tenant', as: 'organizadores' });
TorneoOrganizador.belongsTo(Complex, { foreignKey: 'id_tenant', as: 'club' });

Torneo.hasMany(TorneoCancha,   { foreignKey: 'torneo_id', as: 'canchas', onDelete: 'CASCADE' });
TorneoCancha.belongsTo(Torneo, { foreignKey: 'torneo_id', as: 'torneo' });
TorneoCancha.belongsTo(Field,  { foreignKey: 'field_id',  as: 'field' });

Torneo.hasMany(TorneoZona,     { foreignKey: 'torneo_id', as: 'zonas', onDelete: 'CASCADE' });
TorneoZona.belongsTo(Torneo,   { foreignKey: 'torneo_id', as: 'torneo' });

Torneo.hasMany(TorneoPareja,   { foreignKey: 'torneo_id', as: 'parejas', onDelete: 'CASCADE' });
TorneoPareja.belongsTo(Torneo, { foreignKey: 'torneo_id', as: 'torneo' });
TorneoZona.hasMany(TorneoPareja, { foreignKey: 'zona_id', as: 'parejas' });
TorneoPareja.belongsTo(TorneoZona, { foreignKey: 'zona_id', as: 'zona' });

TorneoPareja.hasMany(TorneoJugador,   { foreignKey: 'pareja_id', as: 'jugadores', onDelete: 'CASCADE' });
TorneoJugador.belongsTo(TorneoPareja, { foreignKey: 'pareja_id', as: 'pareja' });

Torneo.hasMany(TorneoPartido,     { foreignKey: 'torneo_id', as: 'partidos', onDelete: 'CASCADE' });
TorneoPartido.belongsTo(Torneo,   { foreignKey: 'torneo_id', as: 'torneo' });
TorneoZona.hasMany(TorneoPartido, { foreignKey: 'zona_id', as: 'partidos' });
TorneoPartido.belongsTo(TorneoZona,   { foreignKey: 'zona_id',    as: 'zona' });
TorneoPartido.belongsTo(TorneoPareja, { foreignKey: 'pareja1_id', as: 'pareja1' });
TorneoPartido.belongsTo(TorneoPareja, { foreignKey: 'pareja2_id', as: 'pareja2' });
TorneoPartido.belongsTo(Field,        { foreignKey: 'field_id',   as: 'field' });
TorneoPartido.hasOne(TorneoResultado, { foreignKey: 'partido_id', as: 'resultado', onDelete: 'CASCADE' });
TorneoResultado.belongsTo(TorneoPartido, { foreignKey: 'partido_id', as: 'partido' });

TorneoJugador.hasOne(TorneoTicket,   { foreignKey: 'jugador_id', as: 'ticket', onDelete: 'CASCADE' });
TorneoTicket.belongsTo(TorneoJugador, { foreignKey: 'jugador_id', as: 'jugador' });
TorneoTicket.belongsTo(Torneo,        { foreignKey: 'torneo_id',  as: 'torneo' });
TorneoZona.hasMany(TorneoTablaPosicion, { foreignKey: 'zona_id', as: 'tabla', onDelete: 'CASCADE' });
TorneoTablaPosicion.belongsTo(TorneoPareja, { foreignKey: 'pareja_id', as: 'pareja' });
Complex.hasMany(RankingJugador, { foreignKey: 'id_tenant', as: 'ranking' });

// ── Profesores de pádel ──
Complex.hasMany(Profesor,   { foreignKey: 'id_tenant', as: 'profesores' });
Profesor.belongsTo(Complex, { foreignKey: 'id_tenant', as: 'club' });
Profesor.hasMany(ProfesorCancha,   { foreignKey: 'profesor_id', as: 'disponibilidad', onDelete: 'CASCADE' });
ProfesorCancha.belongsTo(Profesor, { foreignKey: 'profesor_id', as: 'profesor' });
ProfesorCancha.belongsTo(Field,    { foreignKey: 'field_id', as: 'field' });
Profesor.hasMany(HorarioProfesor,   { foreignKey: 'profesor_id', as: 'horarios', onDelete: 'CASCADE' });
HorarioProfesor.belongsTo(Profesor, { foreignKey: 'profesor_id', as: 'profesor' });
HorarioProfesor.belongsTo(Field,    { foreignKey: 'field_id', as: 'field' });
HorarioProfesor.hasMany(Alumno,     { foreignKey: 'id_horario', as: 'alumnos', onDelete: 'CASCADE' });
Alumno.belongsTo(HorarioProfesor,   { foreignKey: 'id_horario', as: 'horario' });

// ── Turnos de la agenda ocupados por clases / partidos de torneo ──
TimeSlot.belongsTo(HorarioProfesor, { foreignKey: 'horario_profesor_id', as: 'clase' });
TimeSlot.belongsTo(TorneoPartido,   { foreignKey: 'torneo_partido_id',   as: 'partidoTorneo' });

// ── Escuela de fútbol ──
Complex.hasOne(EscuelaConfig,       { foreignKey: 'complex_id', as: 'escuela' });
EscuelaCategoria.hasMany(EscuelaAlumno,  { foreignKey: 'categoria_id', as: 'alumnos' });
EscuelaAlumno.belongsTo(EscuelaCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
EscuelaCategoria.hasMany(EscuelaHorario,  { foreignKey: 'categoria_id', as: 'horarios', onDelete: 'CASCADE' });
EscuelaHorario.belongsTo(EscuelaCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
EscuelaHorario.belongsTo(Field,            { foreignKey: 'field_id', as: 'field' });
EscuelaAlumno.hasMany(EscuelaPago,   { foreignKey: 'alumno_id', as: 'pagos', onDelete: 'CASCADE' });
EscuelaPago.belongsTo(EscuelaAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
EscuelaAviso.belongsTo(EscuelaCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
// Entrenadores: profesores (login por DNI) ↔ categorías (N:N)
Profesor.belongsToMany(EscuelaCategoria, { through: EscuelaProfesorCategoria, foreignKey: 'profesor_id', otherKey: 'categoria_id', as: 'categoriasEscuela' });
EscuelaCategoria.belongsToMany(Profesor, { through: EscuelaProfesorCategoria, foreignKey: 'categoria_id', otherKey: 'profesor_id', as: 'profesores' });

module.exports = {
  sequelize,
  User, Complex, Field, Agenda, Operation,
  CashRegister, CashTransaction, Collaborator, Image,
  TimeSlot, Booking, Subscription, Notification,
  // Skills
  Token, Contact, TermsVersion, TermsAcceptance,
  // Invites
  Invite,
  // Catálogo de localidades
  Localidad,
  // Favoritos
  Favorite,
  // Push
  PushSubscription,
  // Integraciones por club (multi-tenant)
  ClubIntegration,
  // Lista de incumplidos (inasistencias)
  Blacklist,
  // Cantina
  CantinaProducto, CantinaVenta, CantinaDetalleVenta, CantinaMovimiento,
  CantinaProveedor, CantinaCliente, CantinaPedidoProveedor, CantinaPedidoCliente, CantinaItemPedido,
  CantinaProductoProveedor,
  // Turnos fijos
  RecurringBooking,
  // Consumos por turno
  BookingConsumo,
  // Lista de espera
  Waitlist,
  // WhatsApp: ventana de 24 h + plantillas Meta
  WaConversation, WaTemplate,
  // Torneos de pádel
  Torneo, TorneoOrganizador, TorneoCancha, TorneoZona, TorneoPareja,
  TorneoJugador, TorneoPartido, TorneoResultado, TorneoTicket, TorneoTablaPosicion, RankingJugador,
  // Profesores de pádel
  Profesor, ProfesorCancha, HorarioProfesor, Alumno,
  // Escuela de fútbol
  EscuelaConfig, EscuelaCategoria, EscuelaAlumno, EscuelaProfesorCategoria,
  EscuelaHorario, EscuelaPago, EscuelaAviso,
};
