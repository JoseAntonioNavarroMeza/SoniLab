/**
 * Controlador de Inventario y Catálogo de Instrumentos
 */

// Categorías válidas definidas en el esquema relacional
const VALID_CATEGORIES = ['cuerda', 'viento', 'percusion', 'teclado'];
const VALID_STATUSES = ['AVAILABLE', 'BORROWED', 'MAINTENANCE'];

// 1. LISTAR CATÁLOGO CON FILTROS Y PAGINACIÓN
exports.getInstruments = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 12));
  const offset = (page - 1) * limit;

  const { category, status, search, include_inactive } = req.query;

  try {
    // Auto-corregir instrumentos que hayan quedado en BORROWED sin un préstamo activo real
    await req.pgPool.query(`
      UPDATE instruments i
      SET status = 'AVAILABLE'
      WHERE i.status = 'BORROWED'
        AND NOT EXISTS (
          SELECT 1 FROM loans l
          WHERE l.instrument_id = i.id
            AND l.status IN ('APPROVED', 'ACTIVE', 'IN_INSPECTION')
        )
    `);

    const conditions = [];
    const params = [];

    // Por defecto solo muestra instrumentos activos (a menos que un ADMIN pida ver inactivos)
    if (include_inactive === 'true' && req.user && req.user.role === 'ADMIN') {
      // No filtrar por active
    } else {
      conditions.push('i.active = true');
    }

    if (category) {
      if (VALID_CATEGORIES.includes(category.toLowerCase())) {
        params.push(category.toLowerCase());
        conditions.push(`i.category = $${params.length}`);
      } else {
        return res.status(400).json({ error: `Categoría inválida. Válidas: ${VALID_CATEGORIES.join(', ')}` });
      }
    }

    if (status) {
      if (VALID_STATUSES.includes(status.toUpperCase())) {
        params.push(status.toUpperCase());
        conditions.push(`i.status = $${params.length}`);
      } else {
        return res.status(400).json({ error: `Estado inválido. Válidos: ${VALID_STATUSES.join(', ')}` });
      }
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(i.name ILIKE $${params.length} OR i.serial_number ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Conteo total para metadatos de paginación
    const countQuery = `SELECT COUNT(*) AS total FROM instruments i ${whereClause}`;
    const countResult = await req.pgPool.query(countQuery, params);
    const totalRecords = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    // Consulta de registros paginados incluyendo si hay solicitud pendiente
    const query = `
      SELECT i.id, i.serial_number, i.name, i.category, i.status, i.active, i.created_at,
             (
               SELECT l.status FROM loans l
               WHERE l.instrument_id = i.id
                 AND l.status IN ('PENDING', 'REQUESTED', 'APPROVED', 'ACTIVE', 'IN_INSPECTION')
               ORDER BY l.id DESC LIMIT 1
             ) AS active_loan_status
      FROM instruments i
      ${whereClause}
      ORDER BY i.id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const { rows } = await req.pgPool.query(query, params);

    return res.status(200).json({
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        per_page: limit,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      data: rows
    });
  } catch (error) {
    console.error('Error al listar instrumentos:', error);
    return res.status(500).json({ error: 'Error interno del servidor al consultar catálogo' });
  }
};

// 2. DETALLE DE UN INSTRUMENTO ESPECÍFICO
exports.getInstrumentById = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de instrumento inválido' });
  }

  try {
    const { rows } = await req.pgPool.query(
      `SELECT id, serial_number, name, category, status, active, created_at
       FROM instruments
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Instrumento no encontrado' });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// 3. CREAR INSTRUMENTO (Solo ADMIN)
exports.createInstrument = async (req, res) => {
  const { serial_number, name, category } = req.body;

  if (!serial_number || !name || !category) {
    return res.status(400).json({ error: 'Campos requeridos: serial_number, name, category' });
  }

  const normalizedCategory = category.toLowerCase().trim();
  if (!VALID_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json({ error: `Categoría inválida. Opciones: ${VALID_CATEGORIES.join(', ')}` });
  }

  try {
    // Validar duplicidad de número de serie
    const existing = await req.pgPool.query(
      'SELECT id FROM instruments WHERE serial_number = $1',
      [serial_number.trim().toUpperCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un instrumento registrado con ese número de serie' });
    }

    const { rows } = await req.pgPool.query(
      `INSERT INTO instruments (serial_number, name, category, status, active)
       VALUES ($1, $2, $3, 'AVAILABLE', true)
       RETURNING id, serial_number, name, category, status, active, created_at`,
      [serial_number.trim().toUpperCase(), name.trim(), normalizedCategory]
    );

    return res.status(201).json({
      message: 'Instrumento agregado correctamente al inventario',
      instrument: rows[0]
    });
  } catch (error) {
    console.error('Error al registrar instrumento:', error);
    return res.status(500).json({ error: 'Error interno al registrar instrumento' });
  }
};

// 4. ACTUALIZAR INSTRUMENTO (Solo ADMIN)
exports.updateInstrument = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, category, status, serial_number } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de instrumento inválido' });
  }

  try {
    const existing = await req.pgPool.query('SELECT * FROM instruments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Instrumento no encontrado' });
    }

    const current = existing.rows[0];

    let newCategory = current.category;
    if (category) {
      const normalized = category.toLowerCase().trim();
      if (!VALID_CATEGORIES.includes(normalized)) {
        return res.status(400).json({ error: `Categoría inválida. Opciones: ${VALID_CATEGORIES.join(', ')}` });
      }
      newCategory = normalized;
    }

    let newStatus = current.status;
    if (status) {
      const normalizedStatus = status.toUpperCase().trim();
      if (!VALID_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ error: `Estado inválido. Opciones: ${VALID_STATUSES.join(', ')}` });
      }
      newStatus = normalizedStatus;
    }

    let newSerial = current.serial_number;
    if (serial_number && serial_number.trim().toUpperCase() !== current.serial_number) {
      const checkSerial = await req.pgPool.query(
        'SELECT id FROM instruments WHERE serial_number = $1 AND id <> $2',
        [serial_number.trim().toUpperCase(), id]
      );
      if (checkSerial.rows.length > 0) {
        return res.status(409).json({ error: 'El nuevo número de serie ya está ocupado por otro instrumento' });
      }
      newSerial = serial_number.trim().toUpperCase();
    }

    const newName = name ? name.trim() : current.name;

    const { rows } = await req.pgPool.query(
      `UPDATE instruments
       SET serial_number = $1, name = $2, category = $3, status = $4
       WHERE id = $5
       RETURNING id, serial_number, name, category, status, active, created_at`,
      [newSerial, newName, newCategory, newStatus, id]
    );

    return res.status(200).json({
      message: 'Instrumento actualizado correctamente',
      instrument: rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar instrumento:', error);
    return res.status(500).json({ error: 'Error interno al actualizar datos del instrumento' });
  }
};

// 5. BAJA LÓGICA DE INSTRUMENTO (Solo ADMIN)
exports.deleteInstrument = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de instrumento inválido' });
  }

  try {
    // Validar si el instrumento está actualmente en préstamo activo
    const activeLoans = await req.pgPool.query(
      `SELECT id FROM loans WHERE instrument_id = $1 AND status IN ('PENDING', 'APPROVED', 'IN_INSPECTION')`,
      [id]
    );

    if (activeLoans.rows.length > 0) {
      return res.status(409).json({
        error: 'No se puede dar de baja un instrumento que tiene préstamos pendientes o activos.'
      });
    }

    // Ejecutar baja lógica (active = false) para preservar integridad histórica
    const { rowCount } = await req.pgPool.query(
      `UPDATE instruments SET active = false WHERE id = $1 AND active = true`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Instrumento no encontrado o ya inactivo' });
    }

    return res.status(200).json({ message: 'Instrumento dado de baja lógica correctamente' });
  } catch (error) {
    console.error('Error al dar de baja instrumento:', error);
    return res.status(500).json({ error: 'Error interno al procesar baja lógica' });
  }
};
