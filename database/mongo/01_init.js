db = db.getSiblingDB('sonilab_docs');

// Colección para la bitácora técnica de inspecciones
db.createCollection('technical_inspections', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['loan_id', 'instrument_id', 'inspector_id', 'checklist', 'passed', 'inspected_at'],
      properties: {
        loan_id: { bsonType: 'int', description: 'ID referencial del préstamo en PostgreSQL' },
        instrument_id: { bsonType: 'int', description: 'ID referencial del instrumento' },
        inspector_id: { bsonType: 'int', description: 'ID del usuario administrador' },
        passed: { bsonType: 'bool', description: 'Resultado de la inspección' },
        checklist: {
          bsonType: 'object',
          description: 'Checklist dinámico y polimórfico según categoría de instrumento'
        },
        notes: { bsonType: 'string' },
        inspected_at: { bsonType: 'date' }
      }
    }
  }
});

// Índice único por préstamo para garantizar idempotencia en la sincronización
db.technical_inspections.createIndex({ loan_id: 1 }, { unique: true });

// Colección para auditoría histórica de transiciones de estado
db.createCollection('loan_audit_log');
db.loan_audit_log.createIndex({ loan_id: 1 });
db.loan_audit_log.createIndex({ created_at: -1 });