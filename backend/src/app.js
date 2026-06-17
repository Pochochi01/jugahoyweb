const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const passport = require('./config/passport');

// ── Rutas existentes ──────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const complexRoutes       = require('./routes/complexes');
const agendaRoutes        = require('./routes/agenda');
const operationsRoutes    = require('./routes/operations');
const posRoutes           = require('./routes/pos');
const settingsRoutes      = require('./routes/settings');
const collaboratorsRoutes = require('./routes/collaborators');
const imagesRoutes        = require('./routes/images');
const statsRoutes         = require('./routes/stats');
const publicRoutes        = require('./routes/public');
const usersRoutes         = require('./routes/users');
const adminRoutes         = require('./routes/admin');
const notificationsRoutes = require('./routes/notifications');

// ── Rutas nuevas (skills) ─────────────────────────────────────
const googleAuthRoutes = require('./routes/googleAuth');
const phoneAuthRoutes  = require('./routes/phoneAuth');
const contactRoutes    = require('./routes/contact');
const termsRoutes      = require('./routes/terms');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Montaje de rutas ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);  // GET /api/auth/google, /api/auth/google/callback
app.use('/api/auth', phoneAuthRoutes);   // POST /api/auth/phone/send, /api/auth/phone/verify
app.use('/api/complexes',     complexRoutes);
app.use('/api/agenda',        agendaRoutes);
app.use('/api/operations',    operationsRoutes);
app.use('/api/pos',           posRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/collaborators', collaboratorsRoutes);
app.use('/api/images',        imagesRoutes);
app.use('/api/stats',         statsRoutes);
app.use('/api/public',        publicRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/contact',       contactRoutes);  // POST /api/contact
app.use('/api/terms',         termsRoutes);    // GET /api/terms, POST /api/terms/accept

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Error interno del servidor' });
});

module.exports = app;
