/**
 * config/passport.js
 * Estrategia Google OAuth 2.0 (passport-google-oauth20).
 *
 * Variables requeridas:
 *   GOOGLE_CLIENT_ID     — ID de la app en Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — Secret de la app
 *   GOOGLE_CALLBACK_URL  — debe coincidir con el URI autorizado en Google
 *                          (default: http://localhost:3001/api/auth/google/callback)
 *
 * Flujo:
 *   1. Usuario hace clic en "Continuar con Google"
 *   2. Frontend redirige a GET /api/auth/google
 *   3. Passport redirige a Google para el consentimiento
 *   4. Google llama a GET /api/auth/google/callback con el code
 *   5. Passport intercambia el code por el perfil del usuario
 *   6. Esta función busca o crea el usuario en la DB
 *   7. googleAuthController genera el JWT y redirige al frontend
 */
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

function getUser() { return require('../models').User; }

// Solo inicializar si las credenciales están configuradas
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth deshabilitado: configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env');
} else {
passport.use(
    new GoogleStrategy(
      {
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL ||
                      'http://localhost:3001/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const User      = getUser();
          const email     = profile.emails?.[0]?.value;
          const nombre    = profile.name?.givenName  || profile.displayName || 'Usuario';
          const apellido  = profile.name?.familyName || '';
          const googleId  = profile.id;
          const avatarUrl = profile.photos?.[0]?.value || null;

          if (!email) return done(new Error('Google no proporcionó email'), null);

          let user = await User.findOne({ where: { google_id: googleId } });
          if (!user) {
            user = await User.findOne({ where: { email } });
            if (user) {
              await user.update({ google_id: googleId, avatar_url: avatarUrl });
            } else {
              user = await User.create({
                nombre, apellido, email,
                password:   null,
                google_id:  googleId,
                avatar_url: avatarUrl,
                rol:        'player',
                activo:     true,
              });
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
} // fin if GOOGLE_CLIENT_ID

// Serialize/deserialize (modo stateless JWT)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const User = getUser();
    const user = await User.findByPk(id);
    done(null, user || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
