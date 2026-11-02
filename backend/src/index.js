const express = require('express');
const cors = require('cors');
const os = require('os');
const client = require('prom-client');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const OutboxService = require('./services/outbox.service');

const app = express();
app.use(cors());
app.use(express.json());

require('dotenv').config();

const REPLICA_ID = process.env.HOSTNAME || os.hostname();

// Cabecera de diagnóstico para demostrar balanceo de carga entre réplicas en Kubernetes
app.use((req, res, next) => {
  res.setHeader('X-Served-By', REPLICA_ID);
  next();
});

// 1. Configuración de clientes de bases de datos
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://sonilab_user:sonilab_password@127.0.0.1:5433/sonilab_db';

const pgPool = new Pool({
  connectionString: pgConnectionString,
  max: 10
});

const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://root:rootpassword@127.0.0.1:27017/sonilab_docs?authSource=admin';
const mongoClient = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 5000 });
let mongoDb;
let workerStarted = false;

const outboxWorker = new OutboxService(pgPool, null);

async function connectMongoWithRetry() {
  if (mongoDb) return mongoDb;
  try {
    await mongoClient.connect();
    mongoDb = mongoClient.db('sonilab_docs');
    console.log('Conectado a MongoDB');
    outboxWorker.setMongoDb(mongoDb);
    if (!workerStarted) {
      workerStarted = true;
      outboxWorker.startWorker(5000);
    }
    return mongoDb;
  } catch (err) {
    console.error('Error conectando a MongoDB (reintentando en 4s):', err.message);
    setTimeout(connectMongoWithRetry, 4000);
    return null;
  }
}

connectMongoWithRetry();

// 2. Métricas de Prometheus
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 3]
});

app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, code: res.statusCode });
  });
  next();
});

// 3. Sondas de Kubernetes (Health Checks)
// Liveness: El proceso está vivo (no depende de BD para evitar reinicios en cascada)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'UP', replica: REPLICA_ID, timestamp: new Date() });
});

// Readiness: Ambas bases de datos deben responder antes de aceptar tráfico
app.get('/ready', async (req, res) => {
  try {
    await pgPool.query('SELECT 1');

    if (!mongoDb) {
      await connectMongoWithRetry();
    }
    if (!mongoDb) {
      throw new Error('MongoDB no inicializado');
    }
    await mongoDb.command({ ping: 1 });

    res.status(200).json({
      status: 'READY',
      replica: REPLICA_ID,
      databases: { postgres: 'OK', mongo: 'OK' }
    });
  } catch (error) {
    res.status(503).json({ status: 'NOT_READY', replica: REPLICA_ID, error: error.message });
  }
});

// Endpoint de scraping para Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// 4. Inyección de dependencias en request y arranque
app.use((req, res, next) => {
  req.pgPool = pgPool;
  req.mongoDb = mongoDb;
  req.outboxWorker = outboxWorker;
  next();
});

// Rutas de la API
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/auth.routes'));
app.use('/api/instruments', require('./routes/instruments.routes'));
app.use('/api/loans', require('./routes/loans.routes'));
app.use('/api/inspections', require('./routes/inspections.routes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API SoniLab (${REPLICA_ID}) escuchando en el puerto ${PORT}`);
});
