const waModulos = require('../services/whatsappModulos.service');

/** GET /api/settings/:complexId/whatsapp-modulos — módulos autorizados del número del club. */
async function listar(req, res) {
  try {
    res.json({ modulos: await waModulos.listar(Number(req.params.complexId)) });
  } catch (err) {
    console.error(`[WhatsApp][módulos] listar club ${req.params.complexId}:`, err);
    res.status(500).json({ message: 'No se pudieron cargar los módulos de WhatsApp.' });
  }
}

/** PUT /api/settings/:complexId/whatsapp-modulos — body: { modulos: { agenda: true, torneos: false, … } } */
async function guardar(req, res) {
  try {
    const cambios = req.body?.modulos;
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return res.status(400).json({ message: 'Enviá { modulos: { clave: true|false } }.' });
    res.json({ modulos: await waModulos.guardar(Number(req.params.complexId), cambios, req.user?.id ?? null) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(`[WhatsApp][módulos] guardar club ${req.params.complexId}:`, err);
    res.status(500).json({ message: 'No se pudieron guardar los módulos de WhatsApp.' });
  }
}

module.exports = { listar, guardar };
