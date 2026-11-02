/**
 * Controlador de Inspecciones Técnicas (MongoDB)
 */

async function enrichInspectionsWithPostgres(pgPool, inspections) {
  if (!pgPool || !Array.isArray(inspections) || inspections.length === 0) {
    return inspections;
  }

  try {
    const loanIds = inspections
      .map(i => parseInt(i.loan_id, 10))
      .filter(id => !isNaN(id));

    if (loanIds.length === 0) return inspections;

    const { rows } = await pgPool.query(
      `SELECT l.id AS loan_id, l.user_id, l.status AS loan_status, l.start_date, l.due_date, l.return_date,
              u.name AS user_name, u.email AS user_email,
              i.name AS instrument_name, i.serial_number, i.category
       FROM loans l
       LEFT JOIN users u ON l.user_id = u.id
       LEFT JOIN instruments i ON l.instrument_id = i.id
       WHERE l.id = ANY($1::int[])`,
      [loanIds]
    );

    const loanMap = new Map(rows.map(r => [Number(r.loan_id), r]));

    return inspections.map(insp => {
      const info = loanMap.get(Number(insp.loan_id)) || {};
      return {
        ...insp,
        user_id: insp.user_id || info.user_id || null,
        user_name: insp.user_name || info.user_name || 'Alumno',
        user_email: insp.user_email || info.user_email || '',
        instrument_name: insp.instrument_name || info.instrument_name || `Instrumento #${insp.instrument_id || ''}`,
        serial_number: insp.serial_number || info.serial_number || '',
        category: insp.category || info.category || '',
        status: insp.status || info.loan_status || (insp.passed !== false ? 'RETURNED' : 'RETURNED_WITH_DAMAGE')
      };
    });
  } catch (err) {
    console.warn('No se pudo enriquecer inspecciones desde PostgreSQL:', err.message);
    return inspections;
  }
}

exports.getInspectionByLoanId = async (req, res) => {
  const loanId = parseInt(req.params.loanId, 10);
  if (isNaN(loanId)) {
    return res.status(400).json({ error: 'ID de préstamo inválido' });
  }

  try {
    const inspectionCollection = req.mongoDb.collection('technical_inspections');
    const inspection = await inspectionCollection.findOne({ loan_id: loanId });

    if (!inspection) {
      return res.status(404).json({ error: 'No se encontró inspección técnica para este préstamo' });
    }

    const [enriched] = await enrichInspectionsWithPostgres(req.pgPool, [inspection]);

    // Si es estudiante, solo puede ver inspecciones de préstamos que él mismo solicitó
    if (
      req.user?.role === 'STUDENT' &&
      Number(enriched.user_id) !== Number(req.user.id) &&
      enriched.user_email !== req.user.email
    ) {
      return res.status(403).json({ error: 'No tienes permiso para consultar la inspección de otro alumno' });
    }

    return res.status(200).json({ data: enriched });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getRecentInspections = async (req, res) => {
  try {
    // Si hay eventos pendientes en el Outbox, sincronizarlos antes de listar
    if (req.outboxWorker) {
      try {
        await req.outboxWorker.processPendingEvents();
      } catch (e) {
        // continuar con lectura de Mongo
      }
    }

    const inspectionCollection = req.mongoDb.collection('technical_inspections');
    const inspections = await inspectionCollection
      .find({})
      .sort({ inspected_at: -1, loan_id: -1 })
      .limit(50)
      .toArray();

    const enriched = await enrichInspectionsWithPostgres(req.pgPool, inspections);

    // Filtrar para que los alumnos (STUDENT) solo vean los resúmenes de sus propios préstamos
    if (req.user?.role === 'STUDENT') {
      const ownInspections = enriched.filter(
        insp =>
          (insp.user_id && Number(insp.user_id) === Number(req.user.id)) ||
          (insp.user_email && req.user.email && insp.user_email.toLowerCase() === req.user.email.toLowerCase())
      );
      return res.status(200).json({ data: ownInspections });
    }

    return res.status(200).json({ data: enriched });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
