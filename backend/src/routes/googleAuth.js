/**
 * routes/googleAuth.js — googleAuthSkill
 *
 * GET /api/auth/google          → redirige al consentimiento de Google
 * GET /api/auth/google/callback → callback OAuth, genera JWT, redirige al frontend
 *
 * El frontend recibe el token en el hash de /auth/callback y lo guarda en localStorage.
 */
const router   = require('express').Router();
const passport = require('../config/passport');
const { googleCallback } = require('../controllers/googleAuthController');
const { frontendUrl } = require('../config/urls');

// Inicia el flujo OAuth: redirige a Google
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Callback que Google llama después del consentimiento.
// failureRedirect usa la base canónica del frontend (no el FRONTEND_URL crudo,
// que puede tener varios orígenes separados por coma).
router.get('/google/callback',
  passport.authenticate('google', {
    session:         false,
    failureRedirect: frontendUrl('login?error=google_failed'),
  }),
  googleCallback
);

module.exports = router;
