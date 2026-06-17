/**
 * routes/terms.js — termsSkill
 * GET  /api/terms        → devuelve T&C activos (público)
 * POST /api/terms/accept → registra aceptación (requiere JWT)
 */
const router = require('express').Router();
const { getTerms, acceptTerms }   = require('../controllers/termsController');
const { authenticate }            = require('../middlewares/auth');

router.get('/',       getTerms);
router.post('/accept', authenticate, acceptTerms);

module.exports = router;
