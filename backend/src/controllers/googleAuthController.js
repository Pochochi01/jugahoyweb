/**
 * controllers/googleAuthController.js
 * googleAuthSkill: genera el JWT después del callback de Google OAuth.
 *
 * Passport ya ejecutó la estrategia (config/passport.js) y dejó
 * el usuario en req.user. Aquí solo generamos el token y redirigimos.
 *
 * El frontend lee el token del hash de la URL en /auth/callback
 * (AuthCallbackPage.jsx), lo guarda en localStorage, pide /auth/me y
 * resuelve la ruta final (dashboard o listado de canchas del jugador).
 */
const jwt = require('jsonwebtoken');
const { frontendUrl } = require('../config/urls');

function googleCallback(req, res) {
  // Base canónica del frontend (soporta FRONTEND_URL con múltiples orígenes).
  const loginError = (code) => res.redirect(frontendUrl(`login?error=${code}`));

  try {
    const user = req.user;
    if (!user) return loginError('google_failed');

    if (!process.env.JWT_SECRET) {
      console.error('[googleAuthController] Falta JWT_SECRET en el entorno');
      return loginError('server_error');
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Token en el hash (#) para que NO quede en logs de servidor, en el
    // Referer ni en el historial del navegador. El frontend lo lee y lo borra.
    return res.redirect(frontendUrl(`auth/callback#token=${token}`));

  } catch (err) {
    // No logueamos el token; solo el error.
    console.error('[googleAuthController]', err.message);
    return loginError('server_error');
  }
}

module.exports = { googleCallback };
