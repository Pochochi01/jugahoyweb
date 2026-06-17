const { Notification } = require('../models');

async function getAll(req, res) {
  try {
    const notifs = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function markRead(req, res) {
  try {
    await Notification.update(
      { leida: true },
      { where: { id: req.params.id, user_id: req.user.id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function markAllRead(req, res) {
  try {
    await Notification.update({ leida: true }, { where: { user_id: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAll, markRead, markAllRead };
