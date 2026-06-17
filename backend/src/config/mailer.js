/**
 * config/mailer.js
 * Transporter de Nodemailer. En desarrollo usa Ethereal (emails de prueba);
 * en producción usa las credenciales SMTP del .env.
 *
 * Variables requeridas (producción):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 */
const nodemailer = require('nodemailer');

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_USER) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Desarrollo: cuenta Ethereal efímera (preview en consola)
    const account = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: account.user, pass: account.pass },
    });
    console.log('📧 Ethereal SMTP activo — usuario:', account.user);
  }

  return _transporter;
}

/**
 * sendMail({ to, subject, html, text? })
 * Envía un correo. Las fallas se loguean pero NO propagan
 * (para que un email caído no rompa el flujo principal).
 */
async function sendMail({ to, subject, html, text }) {
  try {
    const t    = await getTransporter();
    const info = await t.sendMail({
      from:    process.env.MAIL_FROM || 'JugaHoy <noreply@jugahoy.com.ar>',
      to, subject, html, text,
    });

    if (process.env.NODE_ENV !== 'production') {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log(`📧 Preview email → ${preview}`);
    }

    return info;
  } catch (err) {
    console.warn('[mailer] No se pudo enviar el correo:', err.message);
    return null;
  }
}

module.exports = { sendMail };
