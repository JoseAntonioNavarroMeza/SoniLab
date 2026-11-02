const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

const pgPool = new Pool({
  connectionString: 'postgresql://sonilab_user:sonilab_password@127.0.0.1:5433/sonilab_db'
});

const mongoUrl = 'mongodb://root:rootpassword@127.0.0.1:27017/sonilab_docs?authSource=admin';

async function processOutbox() {
  const mongoClient = new MongoClient(mongoUrl);
  await mongoClient.connect();
  const db = mongoClient.db('sonilab_docs');
  console.log('Conectado a Mongo exitosamente.');

  const res = await pgPool.query("SELECT * FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC");
  console.log(`Eventos pendientes encontrados: ${res.rows.length}`);

  for (const event of res.rows) {
    console.log(`Procesando evento ID: ${event.id}, aggregate_id: ${event.aggregate_id}`);
    
    // Parsear el payload si viene como string
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    // Insertar en la coleccion de MongoDB
    const insertResult = await db.collection('technical_inspections').insertOne({
      loan_id: event.aggregate_id,
      ...payload,
      synced_at: new Date()
    });

    console.log('Documento insertado en MongoDB con _id:', insertResult.insertedId);

    // Actualizar estado en PostgreSQL
    await pgPool.query(
      "UPDATE outbox_events SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1",
      [event.id]
    );
    console.log(`Evento ${event.id} actualizado a PROCESSED en PostgreSQL.`);
  }

  await mongoClient.close();
  await pgPool.end();
}

processOutbox().catch(err => {
  console.error('Error procesando Outbox:', err);
  process.exit(1);
});
