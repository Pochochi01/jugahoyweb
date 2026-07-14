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
};
