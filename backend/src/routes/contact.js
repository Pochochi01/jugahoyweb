/**
 * routes/contact.js — contactSkill
 * POST /api/contact → guarda mensaje y envía confirmación por email
 */
const router = require('express').Router();
const { createContact } = require('../controllers/contactController');

router.post('/', createContact);

module.exports = router;
