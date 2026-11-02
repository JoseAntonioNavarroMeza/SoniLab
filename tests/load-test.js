/**
 * Prueba de Carga y Verificación de Balanceo / HPA para SoniLab (Sección 9 - E06 y E07)
 *
 * Puede ejecutarse directamente con Node.js (sin instalar nada extra):
 *   node tests/load-test.js
 *
 * Variables opcionales:
 *   API_URL=http://127.0.0.1:3000 CONCURRENCY=25 DURATION_SEC=60 node tests/load-test.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '45', 10);

const latencies = [];
const replicaHits = {};
const statusCounts = {};
let totalRequests = 0;
let totalErrors = 0;

function makeRequest(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const target = new URL(path, BASE_URL);
    const client = target.protocol === 'https:' ? https : http;

    const req = client.get(
      target,
      { rejectUnauthorized: false, timeout: 5000 },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const duration = Date.now() - start;
          latencies.push(duration);
          totalRequests += 1;

          const code = res.statusCode || 0;
          statusCounts[code] = (statusCounts[code] || 0) + 1;
          if (code >= 500 || code === 0) totalErrors += 1;

          const servedBy = res.headers['x-served-by'] || 'local-single-instance';
          replicaHits[servedBy] = (replicaHits[servedBy] || 0) + 1;
          resolve();
        });
      }
    );

    req.on('error', () => {
      totalRequests += 1;
      totalErrors += 1;
      statusCounts['ERR'] = (statusCounts['ERR'] || 0) + 1;
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
    });
  });
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function workerLoop(stopAt) {
  const endpoints = [
    '/api/instruments?page=1&limit=12',
    '/api/instruments?category=cuerda&status=AVAILABLE',
    '/api/instruments?search=Guitarra',
    '/ready'
  ];
  let i = 0;
  while (Date.now() < stopAt) {
    const ep = endpoints[i % endpoints.length];
    await makeRequest(ep);
    i += 1;
  }
}

async function runLoadTest() {
  console.log('==============================================================');
  console.log(' SONILAB - PRUEBA DE CARGA, LATENCIA P95 Y BALANCEO (E06/E07)');
  console.log('==============================================================');
  console.log(`Destino        : ${BASE_URL}`);
  console.log(`Concurrencia   : ${CONCURRENCY} usuarios virtuales`);
  console.log(`Duración       : ${DURATION_SEC} segundos`);
  console.log('--------------------------------------------------------------');

  const startTime = Date.now();
  const stopAt = startTime + DURATION_SEC * 1000;

  const progressTimer = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const p95 = percentile(latencies, 95);
    console.log(`[${elapsed}s / ${DURATION_SEC}s] Peticiones: ${totalRequests} | Errores: ${totalErrors} | Latencia p95: ${p95} ms`);
  }, 5000);

  const workers = Array.from({ length: CONCURRENCY }, () => workerLoop(stopAt));
  await Promise.all(workers);
  clearInterval(progressTimer);

  const totalSec = (Date.now() - startTime) / 1000;
  const rps = (totalRequests / totalSec).toFixed(2);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00';

  console.log('\n================ RESULTADOS FINALES DEL ENSAYO ================');
  console.log(`Total de solicitudes : ${totalRequests}`);
  console.log(`Throughput (RPS)     : ${rps} req/s`);
  console.log(`Latencia mediana p50 : ${p50} ms`);
  console.log(`Latencia p95 (SLO)   : ${p95} ms  [Umbral < 1000 ms: ${p95 < 1000 ? 'CUMPLE' : 'EXCEDE'}]`);
  console.log(`Latencia p99         : ${p99} ms`);
  console.log(`Tasa de errores      : ${errorRate}%  [Umbral < 1%: ${parseFloat(errorRate) < 1 ? 'CUMPLE' : 'EXCEDE'}]`);
  console.log(`Códigos HTTP         : ${JSON.stringify(statusCounts)}`);
  console.log('\n--- Distribución de solicitudes por Réplica (X-Served-By) ---');
  Object.entries(replicaHits).forEach(([replica, hits]) => {
    const pct = ((hits / totalRequests) * 100).toFixed(1);
    console.log(`  Pod/Réplica [${replica}]: ${hits} solicitudes (${pct}%)`);
  });
  console.log('==============================================================');
}

runLoadTest();
