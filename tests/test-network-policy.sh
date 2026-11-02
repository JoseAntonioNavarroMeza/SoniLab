#!/usr/bin/env bash
# ==============================================================================
# SONILAB - Validación de Conectividad, DNS y NetworkPolicies (Sección 5 / E08)
# ==============================================================================
set -e

NAMESPACE="${NAMESPACE:-sonilab}"
CONTEXT="${CONTEXT:-}"
CTX_FLAG=""
if [ -n "$CONTEXT" ]; then
  CTX_FLAG="--context=$CONTEXT"
fi

echo "=================================================================="
echo " PRUEBA E08: VALIDACIÓN DE RED, DNS Y NETWORK POLICIES EN $NAMESPACE"
echo "=================================================================="

BACKEND_POD=$(kubectl $CTX_FLAG -n "$NAMESPACE" get pods -l app=sonilab-backend -o jsonpath='{.items[0].metadata.name}')
echo "[1/4] Pod autorizado detectado: $BACKEND_POD"

echo "[2/4] Verificando resolución DNS interna desde el Pod autorizado..."
kubectl $CTX_FLAG -n "$NAMESPACE" exec "$BACKEND_POD" -- node -e "
  const dns = require('dns');
  dns.lookup('sonilab-postgres', (err, addr) => {
    if (err) { console.error('Fallo DNS:', err); process.exit(1); }
    console.log('DNS OK -> sonilab-postgres resuelve a:', addr);
  });
"

echo "[3/4] Verificando conexión PERMITIDA desde sonilab-backend hacia PostgreSQL (5432) y MongoDB (27017)..."
kubectl $CTX_FLAG -n "$NAMESPACE" exec "$BACKEND_POD" -- node -e "
  const net = require('net');
  function testPort(host, port) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port, timeout: 3000 }, () => {
        console.log('CONEXIÓN PERMITIDA EXITOSA -> ' + host + ':' + port);
        s.end();
        resolve();
      });
      s.on('error', reject);
      s.on('timeout', () => reject(new Error('Timeout')));
    });
  }
  Promise.all([
    testPort('sonilab-postgres', 5432),
    testPort('sonilab-mongo', 27017)
  ]).catch(e => { console.error(e); process.exit(1); });
"

echo "[4/4] Lanzando Pod intruso NO AUTORIZADO (label: app=intruder) para demostrar bloqueo por NetworkPolicy..."
kubectl $CTX_FLAG -n "$NAMESPACE" delete pod netpol-intruder --ignore-not-found=true >/dev/null 2>&1 || true
kubectl $CTX_FLAG -n "$NAMESPACE" run netpol-intruder --image=busybox:1.36 --restart=Never --labels="app=intruder" -- sleep 60
kubectl $CTX_FLAG -n "$NAMESPACE" wait --for=condition=Ready pod/netpol-intruder --timeout=30s

echo "Intentando conectar desde netpol-intruder a sonilab-postgres:5432 (debe expirar por NetworkPolicy)..."
if kubectl $CTX_FLAG -n "$NAMESPACE" exec netpol-intruder -- nc -zv -w 3 sonilab-postgres 5432; then
  echo "ERROR: La conexión desde el Pod no autorizado fue permitida."
  kubectl $CTX_FLAG -n "$NAMESPACE" delete pod netpol-intruder --ignore-not-found=true
  exit 1
else
  echo "BLOQUEO VERIFICADO: NetworkPolicy rechazó (timeout) la conexión hacia PostgreSQL:5432."
fi

echo "Intentando conectar desde netpol-intruder a sonilab-mongo:27017 (debe expirar por NetworkPolicy)..."
if kubectl $CTX_FLAG -n "$NAMESPACE" exec netpol-intruder -- nc -zv -w 3 sonilab-mongo 27017; then
  echo "ERROR: La conexión desde el Pod no autorizado fue permitida."
  kubectl $CTX_FLAG -n "$NAMESPACE" delete pod netpol-intruder --ignore-not-found=true
  exit 1
else
  echo "BLOQUEO VERIFICADO: NetworkPolicy rechazó (timeout) la conexión hacia MongoDB:27017."
fi

echo "Comprobando como control que ambos motores siguen sanos (/ready del backend = 200 OK)..."
kubectl $CTX_FLAG -n "$NAMESPACE" exec "$BACKEND_POD" -- wget -qO- http://127.0.0.1:3000/ready
echo ""

kubectl $CTX_FLAG -n "$NAMESPACE" delete pod netpol-intruder --ignore-not-found=true >/dev/null 2>&1
echo "=================================================================="
echo " RESULTADO E08: TODAS LAS PRUEBAS DE AISLAMIENTO PASARON CON ÉXITO"
echo "=================================================================="
