require('dotenv').config();
const bcrypt = require('bcryptjs');
const { User, sequelize } = require('../src/models');

async function seed() {
  await sequelize.authenticate();
  const hash = await bcrypt.hash('mal211484', 10);
  const [user, created] = await User.findOrCreate({
    where: { email: 'largomauroandres@gmail.com' },
    defaults: {
      nombre: 'Mauro', apellido: 'Largo',
      email: 'largomauroandres@gmail.com',
      password: hash, rol: 'general_admin', activo: true,
    },
  });
  if (!created) {
    await user.update({ rol: 'general_admin', password: hash, activo: true });
    console.log('✓ Admin actualizado');
  } else {
    console.log('✓ Admin creado:', user.email);
  }
  process.exit(0);
}
seed().catch(e => { console.error('✗', e.message); process.exit(1); });
