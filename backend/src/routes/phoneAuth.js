/**
 * routes/phoneAuth.js — phoneAuthSkill
 *
 * POST /api/auth/phone/send   → genera y envía OTP al teléfono
 * POST /api/auth/phone/verify → verifica OTP y devuelve JWT
 */
const router = require('express').Router();
const { sendOTP, verifyOTP } = require('../controllers/phoneAuthController');

router.post('/phone/send',   sendOTP);
router.post('/phone/verify', verifyOTP);

module.exports = router;
