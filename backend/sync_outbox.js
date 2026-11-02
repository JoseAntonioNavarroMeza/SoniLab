const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const OutboxService = require('./src/services/outbox.service');

async function sync() {
  const pgPool = new Pool({ 
    connectionString: 'postgresql://sonilab_user:sonilab_password@127.0.0.1:5433/sonilab_db' 
  });
  const mongo = new MongoClient(
    'mongodb://root:rootpassword@127.0.0.1:27017/sonilab_docs?authSource=admin'
  );

  try {
    await mongo.connect();
    const mongoDb = mongo.db('sonilab_docs');
    const outbox = new OutboxService(pgPool, mongoDb);
    await outbox.reconcileAllEvents();
    console.log('Reconciliación completa de outbox_events hacia MongoDB finalizada.');
  } catch (err) {
    console.error('Error durante la sincronización:', err.message);
  } finally {
    await pgPool.end();
    await mongo.close();
  }
}

sync();
