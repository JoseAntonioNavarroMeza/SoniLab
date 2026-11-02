const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sonilab_dev_secret_key_change_in_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Control de límite de intentos de inicio de sesión por IP/correo (Seguridad de capa de aplicación)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

function checkRateLimit(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { blocked: false };
  if (now - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingSec = Math.ceil((LOCKOUT_WINDOW_MS - (now - record.firstAttempt)) / 1000);
    return { blocked: true, remainingSec };
  }
  return { blocked: false };
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

// 1. REGISTRO DE USUARIOS (Por defecto rol STUDENT; ADMIN asignable)
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Campos requeridos: name, email, password' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'STUDENT';

  try {
    const existing = await req.pgPool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { rows } = await req.pgPool.query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, email, role, active, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, assignedRole]
    );

    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: rows[0]
    });
  } catch (error) {
    console.error('Error en register:', error);
    return res.status(500).json({ error: 'Error interno del servidor al procesar el registro' });
  }
};

// 2. INICIO DE SESIÓN CON LÍMITE DE INTENTOS
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Debe ingresar email y password' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const rateKey = `${req.ip || 'local'}:${normalizedEmail}`;
  const limitStatus = checkRateLimit(rateKey);

  if (limitStatus.blocked) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Intente nuevamente en ${limitStatus.remainingSec} segundos.`
    });
  }

  try {
    const { rows } = await req.pgPool.query(
      'SELECT id, name, email, password_hash, role, active FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      recordFailedAttempt(rateKey);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];

    if (!user.active) {
      return res.status(403).json({ error: 'Cuenta inactiva o dada de baja lógica. Contacte al administrador.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      recordFailedAttempt(rateKey);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    loginAttempts.delete(rateKey);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      message: 'Inicio de sesión exitoso',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// 3. CONSULTA DE PERFIL AUTENTICADO
exports.getProfile = async (req, res) => {
  try {
    const { rows } = await req.pgPool.query(
      'SELECT id, name, email, role, active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ user: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 4. LISTAR USUARIOS CON PAGINACIÓN Y FILTROS (Solo ADMIN)
exports.getUsers = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const { search, role, include_inactive } = req.query;

  try {
    const conditions = [];
    const params = [];

    if (include_inactive !== 'true') {
      conditions.push('active = true');
    }

    if (role && ['ADMIN', 'STUDENT'].includes(role.toUpperCase())) {
      params.push(role.toUpperCase());
      conditions.push(`role = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await req.pgPool.query(`SELECT COUNT(*) AS total FROM users ${whereClause}`, params);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const query = `
      SELECT id, name, email, role, active, created_at
      FROM users
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const { rows } = await req.pgPool.query(query, params);

    return res.status(200).json({
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        per_page: limit
      },
      data: rows
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    return res.status(500).json({ error: 'Error interno al consultar usuarios' });
  }
};

// 5. EDICIÓN DE PERFIL / USUARIO (Propio usuario o ADMIN)
exports.updateUser = async (req, res) => {
  const targetId = parseInt(req.params.id || req.user.id, 10);
  const isAdmin = req.user.role === 'ADMIN';

  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  if (!isAdmin && Number(req.user.id) !== targetId) {
    return res.status(403).json({ error: 'No tienes permisos para editar otro usuario' });
  }

  const { name, email, password, role, active } = req.body;

  try {
    const existing = await req.pgPool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const current = existing.rows[0];
    const newName = name ? name.trim() : current.name;
    let newEmail = current.email;

    if (email && email.toLowerCase().trim() !== current.email) {
      const normalized = email.toLowerCase().trim();
      const dup = await req.pgPool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [normalized, targetId]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Ese correo electrónico ya está en uso por otra cuenta' });
      }
      newEmail = normalized;
    }

    let newPasswordHash = current.password_hash;
    if (password && String(password).trim().length > 0) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      }
      newPasswordHash = await bcrypt.hash(password, 10);
    }

    const newRole = isAdmin && role && ['ADMIN', 'STUDENT'].includes(role.toUpperCase())
      ? role.toUpperCase()
      : current.role;

    const newActive = isAdmin && typeof active === 'boolean' ? active : current.active;

    const { rows } = await req.pgPool.query(
      `UPDATE users
       SET name = $1, email = $2, password_hash = $3, role = $4, active = $5
       WHERE id = $6
       RETURNING id, name, email, role, active, created_at`,
      [newName, newEmail, newPasswordHash, newRole, newActive, targetId]
    );

    return res.status(200).json({
      message: 'Usuario actualizado correctamente',
      user: rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    return res.status(500).json({ error: 'Error interno al actualizar usuario' });
  }
};

// 6. BAJA LÓGICA DE USUARIO (active = false, Solo ADMIN)
exports.deleteUser = async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  if (Number(req.user.id) === targetId) {
    return res.status(400).json({ error: 'No puedes dar de baja tu propia cuenta de administrador en sesión.' });
  }

  try {
    const activeLoans = await req.pgPool.query(
      `SELECT id FROM loans WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED', 'IN_INSPECTION')`,
      [targetId]
    );

    if (activeLoans.rows.length > 0) {
      return res.status(409).json({
        error: 'No se puede dar de baja un usuario con préstamos activos o en revisión.'
      });
    }

    const { rows } = await req.pgPool.query(
      `UPDATE users SET active = false WHERE id = $1 RETURNING id, name, email, role, active`,
      [targetId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({
      message: 'Usuario dado de baja lógica correctamente (active = false)',
      user: rows[0]
    });
  } catch (error) {
    console.error('Error en baja lógica de usuario:', error);
    return res.status(500).json({ error: 'Error interno al dar de baja al usuario' });
  }
};
