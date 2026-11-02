const { Int32 } = require('mongodb');

/**
 * Servicio Outbox para sincronización asíncrona hacia MongoDB
 */
class OutboxService {
  constructor(pgPool, mongoDb = null) {
    this.pgPool = pgPool;
    this.mongoDb = mongoDb;
    this.isRunning = false;
  }

  setMongoDb(mongoDb) {
    this.mongoDb = mongoDb;
  }

  startWorker(intervalMs = 5000) {
    console.log(`[Outbox Worker] Iniciado con intervalo de ${intervalMs}ms`);
    this.reconcileAllEvents().catch(err =>
      console.error('[Outbox Worker] Error en reconciliación inicial:', err.message)
    );

    setInterval(async () => {
      if (this.isRunning || !this.mongoDb) return;
      this.isRunning = true;
      try {
        await this.processPendingEvents();
      } catch (err) {
        console.error('[Outbox Worker] Error general:', err.message);
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);
  }

  async syncEventToMongo(client, event) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    if (event.event_type === 'LOAN_RETURNED_INSPECTION') {
      const inspectionCollection = this.mongoDb.collection('technical_inspections');
      const rawLoanId = parseInt(payload.loan_id || event.aggregate_id, 10);

      // Consultar datos del préstamo, alumno e instrumento en PostgreSQL para enriquecer el documento
      let loanInfo = {};
      if (!isNaN(rawLoanId)) {
        const { rows } = await client.query(
          `SELECT l.id AS loan_id, l.instrument_id, l.status AS loan_status,
                  u.id AS user_id, u.name AS user_name, u.email AS user_email,
                  i.name AS instrument_name, i.serial_number, i.category
           FROM loans l
           LEFT JOIN users u ON l.user_id = u.id
           LEFT JOIN instruments i ON l.instrument_id = i.id
           WHERE l.id = $1`,
          [rawLoanId]
        );
        if (rows.length > 0) {
          loanInfo = rows[0];
        }
      }

      // Int32 para satisfacer "bsonType": "int" del JSON Schema
      const loanId = new Int32(rawLoanId);
      const instrumentId = new Int32(parseInt(payload.instrument_id || loanInfo.instrument_id || 1, 10));
      const inspectorId = new Int32(parseInt(payload.inspector_id || 1, 10));
      const passed = Boolean(payload.passed);
      const notes = String(payload.notes || '');
      const checklist = payload.checklist && typeof payload.checklist === 'object' ? payload.checklist : {};
      const inspectedAt = new Date(payload.inspected_at || event.created_at || Date.now());

      await inspectionCollection.updateOne(
        { loan_id: loanId },
        {
          $set: {
            loan_id: loanId,
            instrument_id: instrumentId,
            inspector_id: inspectorId,
            passed: passed,
            checklist: checklist,
            notes: notes,
            inspected_at: inspectedAt,
            status: payload.status || loanInfo.loan_status || (passed ? 'RETURNED' : 'RETURNED_WITH_DAMAGE'),
            user_name: payload.user_name || loanInfo.user_name || '',
            user_email: payload.user_email || loanInfo.user_email || '',
            instrument_name: payload.instrument_name || loanInfo.instrument_name || '',
            serial_number: payload.serial_number || loanInfo.serial_number || '',
            category: payload.category || loanInfo.category || ''
          }
        },
        { upsert: true }
      );

      const auditCollection = this.mongoDb.collection('loan_audit_log');
      await auditCollection.updateOne(
        { loan_id: loanId, event_type: event.event_type },
        {
          $setOnInsert: {
            loan_id: loanId,
            event_type: event.event_type,
            timestamp: new Date(),
            metadata: {
              status: payload.status || 'RETURNED',
              inspector_id: inspectorId
            }
          }
        },
        { upsert: true }
      );

      console.log(`[Outbox Worker] Sincronizado exitosamente evento ${event.id} (Préstamo #${rawLoanId}) en MongoDB`);
    }
  }

  /**
   * Reconcilia todos los eventos de inspección de outbox_events (incluyendo los que quedaron a medias)
   */
  async reconcileAllEvents() {
    if (!this.mongoDb) return;
    const client = await this.pgPool.connect();
    try {
      const { rows: events } = await client.query(
        `SELECT * FROM outbox_events WHERE event_type = 'LOAN_RETURNED_INSPECTION' ORDER BY id ASC`
      );
      for (const event of events) {
        try {
          await this.syncEventToMongo(client, event);
          if (event.status !== 'PROCESSED') {
            await client.query(
              `UPDATE outbox_events SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [event.id]
            );
          }
        } catch (err) {
          console.error(`[Outbox Worker] Error reconciliando evento ${event.id}:`, err.message);
        }
      }
    } finally {
      client.release();
    }
  }

  async processPendingEvents() {
    if (!this.mongoDb) return;

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');
      const { rows: events } = await client.query(
        `SELECT * FROM outbox_events 
         WHERE status = 'PENDING' AND retry_count < 5 
         ORDER BY id ASC 
         LIMIT 20 
         FOR UPDATE SKIP LOCKED`
      );

      if (events.length === 0) {
        await client.query('COMMIT');
        return;
      }

      console.log(`[Outbox Worker] Eventos a procesar: ${events.length}`);

      for (const event of events) {
        try {
          await this.syncEventToMongo(client, event);

          await client.query(
            `UPDATE outbox_events 
             SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [event.id]
          );
        } catch (eventError) {
          console.error(`[Outbox Worker] Error en evento ${event.id}:`, eventError.message);
          await client.query(
            `UPDATE outbox_events 
             SET retry_count = retry_count + 1, 
                 status = CASE WHEN retry_count + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END 
             WHERE id = $1`,
            [event.id]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = OutboxService;
