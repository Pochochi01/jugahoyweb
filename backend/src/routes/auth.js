const router = require('express').Router();
const { register, login, me, linkComplex, requestPasswordReset, confirmPasswordReset } =
  require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        authenticate, me);
// Vincula al jugador con un complejo (llegada desde el chatbot de WhatsApp)
router.post('/link-complex', authenticate, linkComplex);

// authSkill: recuperación de contraseña
router.post('/reset-password',         requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);

module.exports = router;
