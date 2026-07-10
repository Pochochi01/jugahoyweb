'use strict';
/**
 * controllers/favoritesController.js
 * Gestiona los complejos favoritos de un jugador (player).
 *
 * GET    /api/public/favorites            → complejos favoritos del usuario (con canchas)
 * POST   /api/public/favorites            → agrega { complex_id }
 * DELETE /api/public/favorites/:complexId → quita un favorito
 *
 * Seguridad: player_id se toma SIEMPRE de req.user (nunca del body).
 */
const { Favorite, Complex, Field } = require('../models');

// ── Listar favoritos del jugador ──────────────────────────────
async function listFavorites(req, res) {
  try {
    const favs = await Favorite.findAll({
      where: { player_id: req.user.id },
      include: [{
        model: Complex, as: 'complex',
        // Solo complejos activos; incluye canchas activas para las tarjetas
        where: { activo: true }, required: true,
        include: [{ model: Field, as: 'fields', where: { activa: true }, required: false }],
      }],
      order: [['created_at', 'DESC']],
    });

    // Devolvemos los complejos directamente (lo que consume el front)
    res.json(favs.map(f => f.complex));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── Agregar favorito ──────────────────────────────────────────
async function addFavorite(req, res) {
  try {
    const complexId = parseInt(req.body.complex_id, 10);
    if (!complexId) {
      return res.status(400).json({ message: 'complex_id es requerido' });
    }

    // El complejo debe existir y estar activo
    const complex = await Complex.findOne({ where: { id: complexId, activo: true } });
    if (!complex) {
      return res.status(404).json({ message: 'Complejo no encontrado' });
    }

    // findOrCreate + índice único → idempotente, sin duplicados
    const [fav, created] = await Favorite.findOrCreate({
      where:    { player_id: req.user.id, complex_id: complexId },
      defaults: { player_id: req.user.id, complex_id: complexId },
    });

    res.status(created ? 201 : 200).json({ ok: true, complex_id: complexId, created });
  } catch (err) {
    // Si dos requests concurrentes chocan con el índice único, lo tratamos como éxito
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(200).json({ ok: true, complex_id: parseInt(req.body.complex_id, 10), created: false });
    }
    res.status(500).json({ message: err.message });
  }
}

// ── Quitar favorito ───────────────────────────────────────────
async function removeFavorite(req, res) {
  try {
    const complexId = parseInt(req.params.complexId, 10);
    if (!complexId) {
      return res.status(400).json({ message: 'complexId inválido' });
    }

    const deleted = await Favorite.destroy({
      where: { player_id: req.user.id, complex_id: complexId },
    });

    res.json({ ok: true, removed: deleted > 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { listFavorites, addFavorite, removeFavorite };
