const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://sonilab_user:sonilab_password@127.0.0.1:5433/sonilab_db'
});

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  const res = await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'admin@sonilab.edu']);
  console.log(`Hash actualizado para admin@sonilab.edu (${res.rowCount} fila afectada).`);
  await pool.end();
}

main().catch(err => {
  console.error('Error al actualizar:', err);
  process.exit(1);
});
