/**
 * controllers/termsController.js
 * termsSkill: consulta y aceptación de términos y condiciones.
 */
const { TermsVersion, TermsAcceptance } = require('../models');

// ── GET /api/terms ────────────────────────────────────────────
async function getTerms(req, res) {
  try {
    const terms = await TermsVersion.findOne({
      where: { activo: true },
      order: [['created_at', 'DESC']],
    });

    if (!terms) {
      return res.status(404).json({ message: 'No hay términos y condiciones publicados' });
    }

    return res.json({ terms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── POST /api/terms/accept ────────────────────────────────────
// Requiere autenticación (middleware authenticate en la ruta)
async function acceptTerms(req, res) {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ message: 'La versión de los términos es requerida' });

    const terms = await TermsVersion.findOne({ where: { version } });
    if (!terms) {
      return res.status(404).json({ message: `Versión "${version}" no encontrada` });
    }

    const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
    const userAgent = req.headers['user-agent'] || null;

    // INSERT IGNORE equivalente: upsert por (usuario_id, version)
    await TermsAcceptance.findOrCreate({
      where:    { usuario_id: req.user.id, version },
      defaults: { ip, user_agent: userAgent },
    });

    return res.json({
      message:     `Términos v${version} aceptados.`,
      aceptado_en: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getTerms, acceptTerms };
