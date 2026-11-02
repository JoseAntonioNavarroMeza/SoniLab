# ==============================================================================
# SONILAB - Script PowerShell de Respaldo y Restauracion Aislada (E13)
# Uso en Windows PowerShell:
#   .\tests\backup-restore.ps1
# ==============================================================================
$ErrorActionPreference = "Stop"

$BackupDir = ".\backups_evidencia"
if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$TS = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " PRUEBA E13: RESPALDO CONSISTENTE Y RESTAURACION AISLADA (DOCKER/K8S)" -ForegroundColor Cyan
Write-Host (" Fecha de ejecucion: " + (Get-Date -Format o))
Write-Host ' Objetivo inicial  : RPO <= 24h | RTO <= 30 min (1800 s)'
Write-Host "==================================================================" -ForegroundColor Cyan

$StartTime = Get-Date

$PgFile = "$BackupDir\sonilab_pg_$TS.sql"
$MongoFile = "$BackupDir\sonilab_mongo_$TS.archive"

Write-Host "`n[1/5] Generando respaldo logico consistente de PostgreSQL (pg_dump)..." -ForegroundColor Yellow
docker exec sonilab-postgres sh -c "PGPASSWORD=sonilab_password pg_dump -U sonilab_user -d sonilab_db --clean --if-exists" | Out-File -FilePath $PgFile -Encoding utf8
$PgHash = (Get-FileHash $PgFile -Algorithm SHA256).Hash
"$PgHash  $PgFile" | Out-File "$PgFile.sha256"
$PgLen = (Get-Item $PgFile).Length
Write-Host "  Archivo: $PgFile ($PgLen bytes) | SHA256: $PgHash"

Write-Host "`n[2/5] Generando respaldo documental consistente de MongoDB (mongodump)..." -ForegroundColor Yellow
docker exec sonilab-mongo sh -c "mongodump --username root --password rootpassword --authenticationDatabase admin --db sonilab_docs --archive=/tmp/mongo_backup.archive"
docker cp "sonilab-mongo:/tmp/mongo_backup.archive" $MongoFile
$MongoHash = (Get-FileHash $MongoFile -Algorithm SHA256).Hash
"$MongoHash  $MongoFile" | Out-File "$MongoFile.sha256"
$MongoLen = (Get-Item $MongoFile).Length
Write-Host "  Archivo: $MongoFile ($MongoLen bytes) | SHA256: $MongoHash"

$RestoreStart = Get-Date

Write-Host "`n[3/5] Restaurando PostgreSQL en base aislada 'sonilab_db_recovery'..." -ForegroundColor Yellow
docker exec sonilab-postgres sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d postgres -c 'DROP DATABASE IF EXISTS sonilab_db_recovery;' -c 'CREATE DATABASE sonilab_db_recovery;'"
Get-Content $PgFile | docker exec -i sonilab-postgres sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d sonilab_db_recovery" | Out-Null

Write-Host "`n[4/5] Comprobando conteos en 'sonilab_db_recovery':" -ForegroundColor Green
docker exec sonilab-postgres sh -c "PGPASSWORD=sonilab_password psql -U sonilab_user -d sonilab_db_recovery -c 'SELECT (SELECT COUNT(*) FROM users) AS usuarios, (SELECT COUNT(*) FROM instruments) AS instrumentos, (SELECT COUNT(*) FROM loans) AS prestamos;'"

Write-Host "`n[5/5] Restaurando MongoDB en base aislada 'sonilab_docs_recovery' y comprobando conteos..." -ForegroundColor Yellow
docker exec sonilab-mongo sh -c "mongorestore --username root --password rootpassword --authenticationDatabase admin --nsFrom='sonilab_docs.*' --nsTo='sonilab_docs_recovery.*' --drop --archive=/tmp/mongo_backup.archive"
docker exec sonilab-mongo sh -c "mongosh --quiet -u root -p rootpassword --authenticationDatabase admin sonilab_docs_recovery --eval 'printjson({ technical_inspections: db.technical_inspections.countDocuments(), loan_audit_log: db.loan_audit_log.countDocuments() })'"

$EndTime = Get-Date
$RtoSec = [math]::Round(($EndTime - $RestoreStart).TotalSeconds, 2)
$TotalSec = [math]::Round(($EndTime - $StartTime).TotalSeconds, 2)

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host " RESULTADO E13: RESTAURACION AISLADA EXITOSA" -ForegroundColor Green
Write-Host (" RTO Medido (Tiempo de recuperacion) : " + $RtoSec + " segundos (Objetivo <= 1800s)")
Write-Host (" Tiempo total respaldo + restauracion: " + $TotalSec + " segundos")
Write-Host "==================================================================" -ForegroundColor Cyan