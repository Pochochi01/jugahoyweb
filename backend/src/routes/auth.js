const router = require('express').Router();
const { register, login, me, requestPasswordReset, confirmPasswordReset } =
  require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        authenticate, me);

// authSkill: recuperación de contraseña
router.post('/reset-password',         requestPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);

module.exports = router;
