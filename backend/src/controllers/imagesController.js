const { Image } = require('../models');
const path = require('path');

async function getAll(req, res) {
  try {
    const images = await Image.findAll({ where: { activa: true }, order: [['orden', 'ASC']] });
    res.json(images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function upload(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });
    const url = `/uploads/${req.file.filename}`;
    const image = await Image.create({ url, tipo: req.body.tipo || 'general', alt_text: req.body.alt_text, orden: req.body.orden || 0 });
    res.status(201).json(image);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const image = await Image.findByPk(req.params.id);
    if (!image) return res.status(404).json({ message: 'Imagen no encontrada' });
    await image.update(req.body);
    res.json(image);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const image = await Image.findByPk(req.params.id);
    if (!image) return res.status(404).json({ message: 'Imagen no encontrada' });
    await image.update({ activa: false });
    res.json({ message: 'Imagen eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, upload, update, remove };
