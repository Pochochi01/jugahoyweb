'use strict';
/**
 * scripts/check-expiring-tokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Chequeo periódico de credenciales por club (multi-tenant).
 *
 * Busca integraciones cuyo `fecha_expiracion_token` vence dentro de N días y
 * avisa al DUEÑO del club por dos vías:
 *   1. Notificación in-app (campana del panel)
 *   2. Email (si SMTP está configurado)
 *
 * Uso:
 *   node scripts/check-expiring-tokens.js         → usa TOKEN_ALERT_DAYS o 7
 *   node scripts/check-expiring-tokens.js 14      → avisa con 14 días de margen
 *
 * Cron sugerido (una vez por día, 9:00 hora Argentina):
 *   0 9 * * *  cd /RUTA/AL/PROYECTO/backend && /usr/bin/node scripts/check-expiring-tokens.js >> ../logs/tokens.log 2>&1
 *
 * Nota: los System User Token de Meta son permanentes — para esos, dejá
 * `fecha_expiracion_token` en NULL y no generarán avisos.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const { Op } = require('sequelize');
const { sequelize, Notification, Complex, User } = require('../src/models');
const integrations = require('../src/services/integrations.service');
const { sendMail } = require('../src/config/mailer');

const DIAS = parseInt(process.argv[2] || process.env.TOKEN_ALERT_DAYS || '7', 10);

/** ¿Ya se le avisó a este usuario en las últimas 24 h? (evita spam diario) */
async function yaAvisado(userId) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const n = await Notification.count({
    where: { user_id: userId, tipo: 'token_por_vencer', created_at: { [Op.gte]: desde } },
  });
  return n > 0;
}

async function run() {
  await sequelize.authenticate();

  const porVencer = await integrations.getExpiringSoon(DIAS);
  if (!porVencer.length) {
    console.log(`✓ Sin tokens por vencer en los próximos ${DIAS} días.`);
    return;
  }

  console.log(`⚠ ${porVencer.length} integración(es) con token por vencer (≤ ${DIAS} días):`);

  for (const integ of porVencer) {
    const vence = new Date(integ.fecha_expiracion_token);
    const dias  = Math.ceil((vence - Date.now()) / 86_400_000);
    const estado = dias <= 0 ? 'VENCIDO' : `vence en ${dias} día(s)`;

    // Dueño del club (destinatario del aviso)
    const complex = await Complex.findByPk(integ.club_id, {
      include: [{ model: User, as: 'owner', attributes: ['id', 'nombre', 'email'] }],
      attributes: ['id', 'nombre'],
    });
    const owner = complex?.owner;
    const clubNombre = complex?.nombre || `Club #${integ.club_id}`;

    console.log(`  • ${clubNombre} (club ${integ.club_id}) → ${estado} [${vence.toISOString().slice(0, 10)}]`);

    if (!owner) {
      console.log('    ↳ sin dueño asociado, no se notifica');
      continue;
    }

    const titulo  = dias <= 0 ? '🔴 Credenciales vencidas' : '⚠️ Credenciales por vencer';
    const mensaje = dias <= 0
      ? `Las credenciales de integración de ${clubNombre} están vencidas. Renovalas en Configuración → WhatsApp / MercadoPago para seguir recibiendo reservas y cobros.`
      : `Las credenciales de integración de ${clubNombre} vencen en ${dias} día(s) (${vence.toLocaleDateString('es-AR')}). Renovalas en Configuración para evitar cortes.`;

    // 1) Notificación in-app (con anti-spam de 24 h)
    if (await yaAvisado(owner.id)) {
      console.log('    ↳ ya avisado en las últimas 24 h, se omite');
    } else {
      await Notification.create({ user_id: owner.id, tipo: 'token_por_vencer', titulo, mensaje });
      console.log('    ↳ notificación in-app creada');
    }

    // 2) Email (no bloqueante: si SMTP no está configurado, se ignora)
    if (owner.email) {
      try {
        await sendMail({
          to: owner.email,
          subject: `${titulo} — ${clubNombre}`,
          html: `
            <div style="font-family:sans-serif;max-width:580px;margin:auto">
              <h2 style="color:${dias <= 0 ? '#dc2626' : '#f59e0b'}">${titulo}</h2>
              <p>Hola ${owner.nombre},</p>
              <p>${mensaje}</p>
              <p style="margin-top:20px">
                <a href="${process.env.PUBLIC_URL || 'https://jugahoy.com.ar'}/dashboard"
                   style="background:#22c55e;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;">
                  Ir a Configuración
                </a>
              </p>
              <p style="color:#888;font-size:12px">Este es un aviso automático de JugaHoy.</p>
            </div>`,
        });
        console.log('    ↳ email enviado a', owner.email);
      } catch (e) {
        console.log('    ↳ email no enviado:', e.message);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => { console.error('✗ check-expiring-tokens:', err.message); process.exit(1); });
