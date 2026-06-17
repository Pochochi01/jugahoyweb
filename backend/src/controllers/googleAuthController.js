/**
 * controllers/googleAuthController.js
 * googleAuthSkill: genera el JWT después del callback de Google OAuth.
 *
 * Passport ya ejecutó la estrategia (config/passport.js) y dejó
 * el usuario en req.user. Aquí solo generamos el token y redirigimos.
 *
 * El frontend lee el token del hash de la URL en /auth/callback.
 */
const jwt = require('jsonwebtoken');

function googleCallback(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_failed`
      );
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Token en el hash para que no quede en logs de servidor ni en historial
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback#token=${token}`;
    return res.redirect(redirectUrl);

  } catch (err) {
    console.error('[googleAuthController]', err);
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=server_error`
    );
  }
}

module.exports = { googleCallback };
