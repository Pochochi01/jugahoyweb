const { Op } = require('sequelize');
const { Complex, Field, Booking } = require('../models');
const integrations = require('../services/integrations.service');
const { normalizeWaContacto, isValidWaContacto } = require('../utils/waPhone');
const { superficiesValidas } = require('../utils/canchas');

/**
 * Normaliza/valida la superficie según el deporte.
 * Devuelve { superficie } o lanza un Error con .status=400.
 * basket/squash → superficie null (no aplica).
 */
function resolveSuperficie(deporte, superficie) {
  const validas = superficiesValidas(deporte);
  if (validas.length === 0) return null;               // basket/squash → sin superficie
  if (superficie && !validas.includes(superficie)) {
    const e = new Error(`Superficie inválida para ${deporte}. Opciones: ${validas.join(', ')}.`);
    e.status = 400; throw e;
  }
  return superficie || null;
}

/** URL http/https válida. */
function isValidUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

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

    // Validar el link de invitación (botón "Ver la web" del chatbot).
    // Vacío/null → eliminar (el chatbot usará la home por defecto).
    if (req.body.link_invitacion !== undefined) {
      const raw = req.body.link_invitacion;
      if (raw === null || String(raw).trim() === '') {
        req.body.link_invitacion = null;
      } else if (!isValidUrl(raw)) {
        return res.status(400).json({
          message: 'El link de invitación debe ser una URL válida (empezando con http:// o https://).',
        });
      } else {
        req.body.link_invitacion = String(raw).trim();
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
    const complex_id = req.params.complexId;
    const body = { ...req.body };

    // Superficie válida según deporte (basket/squash → null)
    body.superficie = resolveSuperficie(body.deporte, body.superficie);

    // Identificador incremental "C<n>" por complejo (siguiente al mayor existente)
    const existentes = await Field.findAll({ where: { complex_id }, attributes: ['identificador'] });
    let max = 0;
    for (const f of existentes) {
      const m = /^C(\d+)$/.exec(f.identificador || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    body.identificador = `C${max + 1}`;
    // El nombre de la cancha ES su identificador (C1, C2, ...).
    body.nombre = body.identificador;

    const field = await Field.create({ ...body, complex_id });
    res.status(201).json(field);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

async function updateField(req, res) {
  try {
    const field = await Field.findByPk(req.params.fieldId);
    if (!field) return res.status(404).json({ message: 'Cancha no encontrada' });

    const body = { ...req.body };
    // Validar superficie según el deporte (el actual o el que venga en el body)
    const deporte = body.deporte || field.deporte;
    body.superficie = resolveSuperficie(deporte, body.superficie ?? field.superficie);
    // El identificador se asigna al crear y no se cambia desde la edición
    delete body.identificador;

    await field.update(body);
    res.json(field);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
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
