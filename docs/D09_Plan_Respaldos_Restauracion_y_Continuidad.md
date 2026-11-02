# D09 — Plan de Respaldos, Restauración Aislada y Continuidad (RPO y RTO)

## 1. Objetivos de Recuperación Definidos
- **RPO (Recovery Point Objective — Pérdida máxima tolerable de datos):** **24 horas** para respaldos programados diarios (`CronJob` a las 02:00 AM) y **0 transacciones perdidas** entre PostgreSQL y MongoDB gracias a la tabla `outbox_events` respaldada dentro de PostgreSQL.
- **RTO (Recovery Time Objective — Tiempo máximo de recuperación del servicio):** Meta académica inicial de **<= 30 minutos (1800 segundos)**; meta operativa para el volumen de datos de SoniLab de **<= 60 segundos**.

---

## 2. Arquitectura de Respaldos Consistentes
1. **PostgreSQL (`sonilab_db`):** Se utiliza `pg_dump` (snapshot transaccional consistente en caliente sin bloquear lecturas ni escrituras).
2. **MongoDB (`sonilab_docs`):** Se utiliza `mongodump --archive` (captura consistente de las colecciones `technical_inspections` y `loan_audit_log`).
3. **Almacenamiento Separado e Integridad:**
   - En Kubernetes, el `CronJob` `sonilab-db-backup` (`k8s/base/postgres/statefulset.yaml`) monta un volumen independiente (`sonilab-backups-pvc`), separado de `pgdata` y `mongodata`.
   - Cada archivo genera un resumen criptográfico **SHA-256** (`.sha256`) que se verifica antes de cualquier restauración, con retención automática de 7 días.

---

## 3. Procedimiento de Restauración Aislada y Medición Real (`tests/backup-restore.ps1` — Evidencia `E13`)

Siguiendo la regla obligatoria de la Sección 7 (*"Restaurar cada base en una instancia o espacio de recuperación aislado, nunca sobre el origen de la prueba"*):

### Comando Exacto Ejecutado:
```powershell
.\tests\backup-restore.ps1
```

### Pasos que Ejecuta el Procedimiento:
1. Extrae `sonilab_pg_<TIMESTAMP>.sql` con `pg_dump` y calcula su hash SHA-256.
2. Extrae `sonilab_mongo_<TIMESTAMP>.archive` con `mongodump` y calcula su hash SHA-256.
3. Crea la base de datos aislada `sonilab_db_recovery` en PostgreSQL y restaura el esquema, los usuarios, los 120 instrumentos, los préstamos y los eventos Outbox.
4. Ejecuta consulta de verificación de conteos (`users`, `instruments = 120`, `loans`).
5. Restaura el archivo de MongoDB en la base aislada `sonilab_docs_recovery` (`--nsFrom="sonilab_docs.*" --nsTo="sonilab_docs_recovery.*"`) y comprueba el conteo de documentos en `technical_inspections` y `loan_audit_log`.
6. Calcula y reporta el **RTO medido en segundos**, cumpliendo holgadamente el objetivo de `<= 1800 segundos`.
