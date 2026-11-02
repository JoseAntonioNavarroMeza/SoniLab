const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const OutboxService = require('./src/services/outbox.service');

async function run() {
  const pgPool = new Pool({
    connectionString: 'postgresql://sonilab_user:sonilab_password@127.0.0.1:5433/sonilab_db'
  });
  const mongoUrl = 'mongodb://root:rootpassword@127.0.0.1:27017/sonilab_docs?authSource=admin';
  const mongoClient = new MongoClient(mongoUrl);

  try {
    await mongoClient.connect();
    const db = mongoClient.db('sonilab_docs');
    const outbox = new OutboxService(pgPool, db);
    await outbox.reconcileAllEvents();
    console.log('Todos los eventos de inspección han sido sincronizados a MongoDB.');
  } finally {
    await mongoClient.close();
    await pgPool.end();
  }
}

run().catch(err => {
  console.error('ERROR DETALLADO:', err);
  process.exit(1);
});