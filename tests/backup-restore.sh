#!/usr/bin/env bash
# ==============================================================================
# SONILAB - Respaldo y Restauración Aislada con Medición de RTO/RPO (Sección 7 / E13)
# Funciona tanto con contenedores Docker locales como con Pods en Kubernetes.
# ==============================================================================
set -e

MODE="${MODE:-docker}" # "docker" o "k8s"
NAMESPACE="${NAMESPACE:-sonilab}"
BACKUP_DIR="./backups_evidencia"
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "=================================================================="
echo " PRUEBA E13: RESPALDO CONSISTENTE Y RESTAURACIÓN AISLADA ($MODE)"
echo " Fecha de ejecución: $(date -Iseconds)"
echo " Objetivo inicial  : RPO <= 24h | RTO <= 30 min (1800 s)"
echo "=================================================================="

START_TIME=$(date +%s)

if [ "$MODE" = "docker" ]; then
  PG_EXEC="docker exec -i sonilab-postgres"
  MONGO_EXEC="docker exec -i sonilab-mongo"
else
  PG_POD=$(kubectl -n "$NAMESPACE" get pods -l app=sonilab-postgres -o jsonpath='{.items[0].metadata.name}')
  MONGO_POD=$(kubectl -n "$NAMESPACE" get pods -l app=sonilab-mongo -o jsonpath='{.items[0].metadata.name}')
  PG_EXEC="kubectl -n $NAMESPACE exec -i $PG_POD --"
  MONGO_EXEC="kubectl -n $NAMESPACE exec -i $MONGO_POD --"
fi

echo "[1/5] Generando respaldo lógico consistente de PostgreSQL (pg_dump)..."
$PG_EXEC sh -c "PGPASSWORD=sonilab_password pg_dump -U sonilab_user -d sonilab_db --clean --if-exists" > "$BACKUP_DIR/sonilab_pg_${TS}.sql"
sha256sum "$BACKUP_DIR/sonilab_pg_${TS}.sql" > "$BACKUP_DIR/sonilab_pg_${TS}.sql.sha256"
ls -lh "$BACKUP_DIR/sonilab_pg_${TS}.sql"

echo "[2/5] Generando respaldo documental consistente de MongoDB (mongodump)..."
$MONGO_EXEC sh -c "mongodump --username root --password rootpassword --authenticationDatabase admin --db sonilab_docs --archive" > "$BACKUP_DIR/sonilab_mongo_${TS}.archive"
sha256sum "$BACKUP_DIR/sonilab_mongo_${TS}.archive" > "$BACKUP_DIR/sonilab_mongo_${TS}.archive.sha256"
ls -lh "$BACKUP_DIR/sonilab_mongo_${TS}.archive"

echo "[3/5] Verificando integridad SHA-256 de ambos respaldos..."
sha256sum -c "$BACKUP_DIR/sonilab_pg_${TS}.sql.sha256"
sha256sum -c "$BACKUP_DIR/sonilab_mongo_${TS}.archive.sha256"

RESTORE_START=$(date +%s)

echo "[4/5] Restaurando PostgreSQL en base aislada 'sonilab_db_recovery' (sin tocar el origen)..."
$PG_EXEC sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d postgres -c 'DROP DATABASE IF EXISTS sonilab_db_recovery; CREATE DATABASE sonilab_db_recovery;'"
$PG_EXEC sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d sonilab_db_recovery" < "$BACKUP_DIR/sonilab_pg_${TS}.sql" >/dev/null

echo "Comprobando conteos en 'sonilab_db_recovery':"
$PG_EXEC sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d sonilab_db_recovery -c 'SELECT (SELECT COUNT(*) FROM users) AS usuarios, (SELECT COUNT(*) FROM instruments) AS instrumentos, (SELECT COUNT(*) FROM loans) AS prestamos;'"

echo "[5/5] Restaurando MongoDB en base aislada 'sonilab_docs_recovery' (sin tocar el origen)..."
$MONGO_EXEC sh -c "mongorestore --username root --password rootpassword --authenticationDatabase admin --nsFrom='sonilab_docs.*' --nsTo='sonilab_docs_recovery.*' --drop --archive" < "$BACKUP_DIR/sonilab_mongo_${TS}.archive"

echo "Comprobando conteos en 'sonilab_docs_recovery':"
$MONGO_EXEC sh -c "mongosh --quiet -u root -p rootpassword --authenticationDatabase admin sonilab_docs_recovery --eval 'printjson({ technical_inspections: db.technical_inspections.countDocuments(), loan_audit_log: db.loan_audit_log.countDocuments() })'"

END_TIME=$(date +%s)
RTO_SECONDS=$((END_TIME - RESTORE_START))
TOTAL_SECONDS=$((END_TIME - START_TIME))

echo "=================================================================="
echo " RESULTADO E13: RESTAURACIÓN AISLADA EXITOSA"
echo " RTO Medido (Tiempo de recuperación) : ${RTO_SECONDS} segundos (Objetivo <= 1800s)"
echo " Tiempo total respaldo + restauración: ${TOTAL_SECONDS} segundos"
echo "=================================================================="
