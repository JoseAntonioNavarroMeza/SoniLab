/**
 * Controlador de Préstamos (Loans)
 */

// 1. SOLICITAR PRÉSTAMO (RN01 y RN02)
exports.requestLoan = async (req, res) => {
  const client = await req.pgPool.connect();
  const userId = req.user.id; 
  const { instrument_id, start_date, due_date } = req.body;

  if (!instrument_id || !start_date || !due_date) {
    return res.status(400).json({ error: 'Campos obligatorios: instrument_id, start_date, due_date' });
  }

  if (new Date(due_date) < new Date(start_date)) {
    return res.status(400).json({ error: 'La fecha de devolución no puede ser anterior a la fecha de inicio.' });
  }

  try {
    await client.query('BEGIN');

    // RN01: Verificar límite de préstamos concurrentes
    const { rows: activeLoans } = await client.query(
      `SELECT id, status FROM loans 
       WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED', 'ACTIVE', 'IN_INSPECTION')`,
      [userId]
    );

    if (activeLoans.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'RN01: Ya cuentas con un préstamo activo o en proceso de revisión.' 
      });
    }

    // RN02: Bloqueo por condición física/operativa
    const { rows: instruments } = await client.query(
      `SELECT id, status, active FROM instruments WHERE id = $1 FOR UPDATE`,
      [instrument_id]
    );

    if (instruments.length === 0 || !instruments[0].active) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Instrumento no encontrado o dado de baja.' });
    }

    const instrument = instruments[0];

    // Verificar si el instrumento tiene un préstamo activo real en la tabla loans
    const { rows: instActiveLoans } = await client.query(
      `SELECT id, status FROM loans
       WHERE instrument_id = $1 AND status IN ('PENDING', 'REQUESTED', 'APPROVED', 'ACTIVE', 'IN_INSPECTION')`,
      [instrument_id]
    );

    // Si estaba marcado como BORROWED pero ya no tiene ningún préstamo activo en curso, liberar a AVAILABLE
    if (instrument.status === 'BORROWED' && instActiveLoans.length === 0) {
      await client.query(`UPDATE instruments SET status = 'AVAILABLE' WHERE id = $1`, [instrument_id]);
      instrument.status = 'AVAILABLE';
    }

    if (instrument.status !== 'AVAILABLE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: `RN02: El instrumento no está disponible (Estado actual: ${instrument.status}).` 
      });
    }

    if (instActiveLoans.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `RN02: El instrumento ya cuenta con una solicitud o préstamo en curso (${instActiveLoans[0].status}).`
      });
    }

    const { rows: newLoan } = await client.query(
      `INSERT INTO loans (user_id, instrument_id, status, start_date, due_date)
       VALUES ($1, $2, 'PENDING', $3, $4) RETURNING *`,
      [userId, instrument_id, start_date, due_date]
    );

    await client.query('COMMIT');
    return res.status(201).json({ message: 'Solicitud de préstamo registrada', loan: newLoan[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al solicitar préstamo:', err);
    return res.status(500).json({ error: 'Error interno del servidor al procesar préstamo' });
  } finally {
    client.release();
  }
};

// 2. APROBAR PRÉSTAMO (Solo Rol ADMIN)
exports.approveLoan = async (req, res) => {
  const client = await req.pgPool.connect();
  const loanId = parseInt(req.params.id, 10);

  try {
    await client.query('BEGIN');

    const { rows: loans } = await client.query(
      `SELECT * FROM loans WHERE id = $1 FOR UPDATE`,
      [loanId]
    );

    if (loans.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    const loan = loans[0];
    if (loan.status !== 'PENDING' && loan.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No se puede aprobar un préstamo en estado '${loan.status}'` });
    }

    await client.query(`UPDATE loans SET status = 'APPROVED' WHERE id = $1`, [loanId]);
    await client.query(`UPDATE instruments SET status = 'BORROWED' WHERE id = $1`, [loan.instrument_id]);

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Préstamo aprobado con éxito' });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// 2.1 RECHAZAR PRÉSTAMO (Solo Rol ADMIN)
exports.rejectLoan = async (req, res) => {
  const client = await req.pgPool.connect();
  const loanId = parseInt(req.params.id, 10);

  try {
    await client.query('BEGIN');

    const { rows: loans } = await client.query(
      `SELECT * FROM loans WHERE id = $1 FOR UPDATE`,
      [loanId]
    );

    if (loans.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    const loan = loans[0];
    if (loan.status !== 'PENDING' && loan.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No se puede rechazar un préstamo en estado '${loan.status}'` });
    }

    await client.query(`UPDATE loans SET status = 'REJECTED' WHERE id = $1`, [loanId]);
    await client.query(`UPDATE instruments SET status = 'AVAILABLE' WHERE id = $1`, [loan.instrument_id]);

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Préstamo rechazado con éxito' });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// 3. INICIAR DEVOLUCIÓN (Pasa a estado IN_INSPECTION)
exports.initiateReturn = async (req, res) => {
  const client = await req.pgPool.connect();
  const loanId = parseInt(req.params.id, 10);

  try {
    await client.query('BEGIN');

    const { rows: loans } = await client.query(
      `SELECT * FROM loans WHERE id = $1 FOR UPDATE`,
      [loanId]
    );

    if (loans.length === 0 || loans[0].status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El préstamo debe estar en estado APPROVED para devolver' });
    }

    await client.query(`UPDATE loans SET status = 'IN_INSPECTION' WHERE id = $1`, [loanId]);

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Instrumento recibido; pendiente de inspección técnica' });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// 4. CERRAR PRÉSTAMO CON INSPECCIÓN TÉCNICA (RN03 y Patrón Outbox)
exports.closeLoanWithInspection = async (req, res) => {
  const client = await req.pgPool.connect();
  const loanId = parseInt(req.params.id, 10);
  const inspectorId = req.user.id;
  const { checklist, passed, notes } = req.body;

  if (!checklist || typeof passed !== 'boolean') {
    return res.status(400).json({ 
      error: 'RN03: Para cerrar la devolución es obligatorio adjuntar el checklist de inspección física y el dictamen (passed: true/false).' 
    });
  }

  let inspectionPayload;

  try {
    await client.query('BEGIN');

    const { rows: loans } = await client.query(
      `SELECT l.*, u.name AS user_name, u.email AS user_email,
              i.name AS instrument_name, i.serial_number, i.category
       FROM loans l
       JOIN users u ON l.user_id = u.id
       JOIN instruments i ON l.instrument_id = i.id
       WHERE l.id = $1 FOR UPDATE OF l`,
      [loanId]
    );

    if (loans.length === 0 || loans[0].status !== 'IN_INSPECTION') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El préstamo debe estar en estado IN_INSPECTION para cerrarse.' });
    }

    const loan = loans[0];
    const finalLoanStatus = passed ? 'RETURNED' : 'RETURNED_WITH_DAMAGE';
    const finalInstrumentStatus = passed ? 'AVAILABLE' : 'MAINTENANCE';

    await client.query(
      `UPDATE loans SET status = $1, return_date = CURRENT_DATE WHERE id = $2`,
      [finalLoanStatus, loanId]
    );

    await client.query(
      `UPDATE instruments SET status = $1 WHERE id = $2`,
      [finalInstrumentStatus, loan.instrument_id]
    );

    inspectionPayload = {
      loan_id: loanId,
      instrument_id: loan.instrument_id,
      inspector_id: inspectorId,
      user_id: loan.user_id,
      user_name: loan.user_name,
      user_email: loan.user_email,
      instrument_name: loan.instrument_name,
      serial_number: loan.serial_number,
      category: loan.category,
      checklist,
      passed,
      notes: notes || '',
      status: finalLoanStatus,
      inspected_at: new Date().toISOString()
    };

    await client.query(
      `INSERT INTO outbox_events (aggregate_id, event_type, payload, status)
       VALUES ($1, 'LOAN_RETURNED_INSPECTION', $2, 'PENDING')`,
      [loanId.toString(), JSON.stringify(inspectionPayload)]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al cerrar préstamo:', err);
    return res.status(500).json({ error: 'Error interno al procesar el cierre del préstamo' });
  } finally {
    client.release();
  }

  if (req.outboxWorker) {
    try {
      await req.outboxWorker.processPendingEvents();
    } catch (syncErr) {
      console.warn('Sincronización inmediata diferida al worker Outbox:', syncErr.message);
    }
  }

  return res.status(200).json({ 
    message: 'Préstamo cerrado correctamente. Inspección técnica sincronizada.',
    status: inspectionPayload.status,
    inspection: inspectionPayload
  });
};

// 5. CONSULTA DE PRÉSTAMOS CON PAGINACIÓN Y FILTROS POR RANGO DE FECHAS Y ESTADO
exports.getLoans = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const { status, from_date, to_date } = req.query;

  try {
    const conditions = [];
    const params = [];

    // Si es estudiante, solo ve sus propios préstamos
    if (req.user.role === 'STUDENT') {
      params.push(req.user.id);
      conditions.push(`l.user_id = $${params.length}`);
    }

    if (status) {
      const upperStatus = status.toUpperCase();
      if (upperStatus === 'CLOSED') {
        conditions.push(`l.status IN ('RETURNED', 'RETURNED_WITH_DAMAGE', 'REJECTED')`);
      } else if (upperStatus === 'ALL') {
        // Sin filtro de estado
      } else {
        params.push(upperStatus);
        conditions.push(`l.status = $${params.length}`);
      }
    } else {
      conditions.push(`l.status IN ('PENDING', 'REQUESTED', 'APPROVED', 'ACTIVE', 'IN_INSPECTION')`);
    }

    if (from_date) {
      params.push(from_date);
      conditions.push(`l.start_date >= $${params.length}`);
    }

    if (to_date) {
      params.push(to_date);
      conditions.push(`l.due_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await req.pgPool.query(`SELECT COUNT(*) AS total FROM loans l ${whereClause}`, params);
    const totalRecords = parseInt(countRes.rows[0].total, 10);

    const query = `
      SELECT l.*, u.name as user_name, u.email as user_email,
             i.name as instrument_name, i.serial_number, i.category
      FROM loans l
      JOIN users u ON l.user_id = u.id
      JOIN instruments i ON l.instrument_id = i.id
      ${whereClause}
      ORDER BY l.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const { rows } = await req.pgPool.query(query, params);
    
    return res.status(200).json({
      page,
      limit,
      total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit) || 1,
      loans: rows
    });
  } catch (err) {
    console.error('Error en getLoans:', err);
    return res.status(500).json({ error: err.message });
  }
};

// 6. REPORTE DE PRÉSTAMOS CERRADOS Y MÉTRICAS DE TALLER
exports.getClosedLoansReport = async (req, res) => {
  const { from_date, to_date } = req.query;
  try {
    const conditions = [`l.status IN ('RETURNED', 'RETURNED_WITH_DAMAGE', 'REJECTED')`];
    const params = [];

    if (req.user.role === 'STUDENT') {
      params.push(req.user.id);
      conditions.push(`l.user_id = $${params.length}`);
    }

    if (from_date) {
      params.push(from_date);
      conditions.push(`l.start_date >= $${params.length}`);
    }

    if (to_date) {
      params.push(to_date);
      conditions.push(`l.due_date <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE l.status = 'RETURNED')::int AS returned_ok,
        COUNT(*) FILTER (WHERE l.status = 'RETURNED_WITH_DAMAGE')::int AS returned_damaged,
        COUNT(*) FILTER (WHERE l.status = 'REJECTED')::int AS rejected,
        COUNT(*)::int AS total_closed
      FROM loans l
      ${whereClause}
    `;
    const summaryRes = await req.pgPool.query(summaryQuery, params);

    const detailQuery = `
      SELECT l.id, l.status, l.start_date, l.due_date, l.return_date,
             u.name AS user_name, u.email AS user_email,
             i.name AS instrument_name, i.serial_number, i.category
      FROM loans l
      JOIN users u ON l.user_id = u.id
      JOIN instruments i ON l.instrument_id = i.id
      ${whereClause}
      ORDER BY l.id DESC
      LIMIT 50
    `;
    const detailRes = await req.pgPool.query(detailQuery, params);

    return res.status(200).json({
      summary: summaryRes.rows[0],
      closed_loans: detailRes.rows
    });
  } catch (err) {
    console.error('Error en getClosedLoansReport:', err);
    return res.status(500).json({ error: err.message });
  }
};
