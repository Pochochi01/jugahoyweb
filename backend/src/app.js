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
const chatbotRoutes    = require('./routes/chatbot');
const invitesRoutes    = require('./routes/invites');
const paymentRoutes    = require('./routes/payment.routes');

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

// ── CORS ──────────────────────────────────────────────────────
// FRONTEND_URL puede ser un único origen o varios separados por coma:
//   desarrollo:  http://localhost:5173
//   producción:  https://jugahoy.com.ar,https://www.jugahoy.com.ar
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (apps móviles, curl, webhooks de Meta)
    if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true); }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));


// -- request options agregate mauro ----------------------------
app.options('*',cors());
// ── Parsers ───────────────────────────────────────────────────
// `verify` guarda el cuerpo crudo en req.rawBody → necesario para validar la
// firma HMAC del webhook de WhatsApp (Meta firma sobre el body sin parsear).
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// ── Passport ──────────────────────────────────────────────────
app.use(passport.initialize());

// ── Archivos estáticos: uploads ───────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── API routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);   // GET /api/auth/google, /api/auth/google/callback
app.use('/api/auth', phoneAuthRoutes);    // POST /api/auth/phone/send, /api/auth/phone/verify
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
app.use('/api/contact',       contactRoutes);
app.use('/api/terms',         termsRoutes);
app.use('/api/chatbot',       chatbotRoutes);
app.use('/api/invites',       invitesRoutes);
app.use('/api/payments',      paymentRoutes);

// ── Frontend estático (modo mismo-servidor) ───────────────────
// Activar con SERVE_FRONTEND=true en .env.production cuando el frontend
// y el backend corren en el mismo proceso (un solo puerto público).
// El build del frontend debe estar en ../frontend/dist (npm run build desde /frontend).
if (isProd && process.env.SERVE_FRONTEND === 'true') {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  // Todas las rutas no-API devuelven el index.html (React Router client-side)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Manejador global de errores ───────────────────────────────
app.use((err, req, res, _next) => {
  // En producción no exponer el stack trace
  if (isProd) {
    console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Error interno del servidor' });
  }
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Error interno del servidor', stack: err.stack });
});

module.exports = app;
