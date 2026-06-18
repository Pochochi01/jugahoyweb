/**
 * src/routes/chatbot.js  — chatbotSkill
 *
 * REST API:
 *   GET  /api/chatbot/days                  → próximos 8 días
 *   GET  /api/chatbot/schedules/:day        → slots disponibles (YYYY-MM-DD)
 *   POST /api/chatbot/confirm               → confirmar turno
 *   POST /api/chatbot/cancel                → cancelar turno
 *   GET  /api/chatbot/extras                → botones CTA
 *
 * WhatsApp Webhook:
 *   GET  /api/chatbot/webhook               → verificación Meta
 *   POST /api/chatbot/webhook               → mensajes entrantes
 */
const router = require('express').Router();
const {
  getDays,
  getSchedules,
  confirmBooking,
  cancelBooking,
  getExtras,
  verifyWebhook,
  handleWebhook,
} = require('../controllers/chatbotController');

// ── REST ──────────────────────────────────────────────────────
router.get('/days',           getDays);
router.get('/schedules/:day', getSchedules);
router.post('/confirm',       confirmBooking);
router.post('/cancel',        cancelBooking);
router.get('/extras',         getExtras);

// ── WhatsApp Webhook ──────────────────────────────────────────
router.get('/webhook',  verifyWebhook);
router.post('/webhook', handleWebhook);

module.exports = router;
