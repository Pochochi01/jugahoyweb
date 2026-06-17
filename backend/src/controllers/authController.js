/**
 * controllers/authController.js
 * authSkill: login, register, me, reset-password.
 *
 * Cambios respecto a la versión original:
 *  - login: maneja password null (usuarios OAuth)
 *  - register: envía correo de bienvenida (no bloqueante)
 *  - requestPasswordReset: genera token SHA-256 y envía email
 *  - confirmPasswordReset: verifica token y actualiza password
 */
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { User, Collaborator, Complex, Token } = require('../models');
const { sendMail } = require('../config/mailer');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function fetchCollaboratorData(userId) {
  return Collaborator.findAll({
    where: { user_id: userId, activo: true },
    include: [{ model: Complex, as: 'complex', attributes: ['id', 'nombre', 'ciudad', 'activo'] }],
    attributes: ['id', 'complex_id', 'permisos', 'activo', 'nombre', 'apellido'],
  });
}

// ── register ──────────────────────────────────────────────────
async function register(req, res) {
  try {
    const { nombre, apellido, email, password, telefono } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(409).json({ message: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ nombre, apellido, email, password: hash, telefono });

    const token = generateToken(user);

    // Correo de bienvenida (no bloqueante)
    sendMail({
      to:      email,
      subject: '¡Bienvenido a JugaHoy! 🎾',
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:auto">
          <h2 style="color:#22c55e">¡Hola, ${nombre}!</h2>
          <p>Tu cuenta en <strong>JugaHoy</strong> fue creada correctamente.</p>
          <p>Ya podés explorar canchas y hacer tus reservas.</p>
          <p style="margin-top:20px">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/canchas"
               style="background:#22c55e;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
              Explorar canchas
            </a>
          </p>
        </div>`,
    });

    res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── login ─────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email, activo: true } });
    if (!user) return res.status(401).json({ message: 'Credenciales incorrectas' });

    // Cuenta creada con Google: no tiene contraseña local
    if (!user.password) {
      return res.status(400).json({
        message: 'Esta cuenta usa inicio de sesión con Google. Usá el botón "Continuar con Google".',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Credenciales incorrectas' });

    const token    = generateToken(user);
    const response = { token, user: sanitize(user) };

    if (user.rol === 'collaborator') {
      response.collaborators = await fetchCollaboratorData(user.id);
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── me ────────────────────────────────────────────────────────
async function me(req, res) {
  try {
    const response = { user: sanitize(req.user) };
    if (req.user.rol === 'collaborator') {
      response.collaborators = await fetchCollaboratorData(req.user.id);
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── requestPasswordReset ──────────────────────────────────────
async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requerido' });

    const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });

    // Respondemos OK aunque el email no exista (previene enumeración de usuarios)
    if (!user) {
      return res.json({ message: 'Si el email existe, recibirás el enlace de recuperación.' });
    }

    // Cuenta OAuth sin contraseña local: no tiene sentido resetear
    if (!user.password && user.google_id) {
      return res.json({ message: 'Si el email existe, recibirás el enlace de recuperación.' });
    }

    const rawToken  = await Token.createResetToken(user.id, 60);
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;

    await sendMail({
      to:      user.email,
      subject: 'Restablecé tu contraseña — JugaHoy',
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:auto">
          <h2 style="color:#22c55e">Hola, ${user.nombre}</h2>
          <p>Recibiste este correo porque solicitaste restablecer tu contraseña en JugaHoy.</p>
          <p style="margin:20px 0">
            <a href="${resetLink}"
               style="background:#22c55e;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
              Restablecer contraseña
            </a>
          </p>
          <p style="color:#888;font-size:12px">
            Este enlace expira en 60 minutos. Si no solicitaste este cambio, ignorá este correo.
          </p>
        </div>`,
    });

    res.json({ message: 'Si el email existe, recibirás el enlace de recuperación.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── confirmPasswordReset ──────────────────────────────────────
async function confirmPasswordReset(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const record = await Token.verifyToken(token, 'reset_password');
    if (!record) {
      return res.status(400).json({ message: 'El enlace es inválido o ya expiró' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await User.update({ password: hash }, { where: { id: record.usuario_id } });
    await record.update({ usado: true });

    res.json({ message: 'Contraseña actualizada correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── helper ────────────────────────────────────────────────────
function sanitize(user) {
  const { password, ...safe } = user.toJSON();
  return safe;
}

module.exports = { register, login, me, requestPasswordReset, confirmPasswordReset };
