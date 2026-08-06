const { Op } = require('sequelize');
const { Complex, Field, Booking } = require('../models');
const integrations = require('../services/integrations.service');
const { normalizeWaContacto, isValidWaContacto } = require('../utils/waPhone');

async function getSettings(req, res) {
  try {
    const complex = await Complex.findByPk(req.params.complexId, {
      include: [{ model: Field, as: 'fields' }],
    });
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });
    res.json(complex);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const complex = await Complex.findByPk(req.params.complexId);
    if (!complex) return res.status(404).json({ message: 'Complejo no encontrado' });

    // Validar/normalizar el WhatsApp de contacto de la cancha si viene en el body.
    // Vacío/null → eliminar el número (el botón deja de mostrarse en el chatbot).
    if (req.body.whatsapp_contacto !== undefined) {
      const raw = req.body.whatsapp_contacto;
      if (raw === null || String(raw).trim() === '') {
        req.body.whatsapp_contacto = null;
      } else {
        const norm = normalizeWaContacto(raw);
        if (!isValidWaContacto(norm)) {
          return res.status(400).json({
            message: 'Número de WhatsApp inválido. Debe ser +549 + código de área (sin 0) + número (sin 15). Ej: +549381800459',
          });
        }
        req.body.whatsapp_contacto = norm;
      }
    }

    await complex.update(req.body);

    // Multi-tenant: si el panel guardó el token de MercadoPago, replicarlo en
    // club_integrations (fuente de verdad) para que el frontend actual siga
    // funcionando sin cambios y las credenciales queden centralizadas.
    if (req.body?.mercadopago_token !== undefined) {
      await integrations.upsertIntegration(complex.id, {
        mercadopago_access_token: req.body.mercadopago_token || null,
      });
    }

    res.json(complex);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFields(req, res) {
  try {
    const fields = await Field.findAll({ where: { complex_id: req.params.complexId } });
    res.json(fields);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createField(req, res) {
  try {
    const field = await Field.create({ ...req.body, complex_id: req.params.complexId });
    res.status(201).json(field);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateField(req, res) {
  try {
    const field = await Field.findByPk(req.params.fieldId);
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });
    await field.update(req.body);
    res.json(field);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function toggleField(req, res) {
  try {
    const field = await Field.findByPk(req.params.fieldId);
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });
    await field.update({ activa: !field.activa });
    res.json(field);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteField(req, res) {
  try {
    const field = await Field.findByPk(req.params.fieldId);
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });

    // Verificar que no tenga reservas activas futuras
    const upcoming = await Booking.count({
      where: {
        field_id: field.id,
        estado: 'confirmado',
        fecha: { [Op.gte]: new Date().toISOString().split('T')[0] },
      },
    });
    if (upcoming > 0) {
      return res.status(409).json({
        message: `La cancha tiene ${upcoming} reserva(s) activa(s). Cancelá las reservas antes de eliminarla.`,
      });
    }

    await field.destroy();
    res.json({ message: 'Cancha eliminada definitivamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getSettings, updateSettings, getFields, createField, updateField, toggleField, deleteField };
