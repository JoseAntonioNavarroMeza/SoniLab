# D08 — Manual de Operación, Observabilidad, Alertas y Respuesta a Incidentes

## 1. Cobertura de Observabilidad Implementada (`observability/`)
- **Métricas de Aplicación (`/metrics` en `sonilab-backend`):** Histograma `http_request_duration_seconds` con etiquetas `method`, `route`, `code` y métricas de proceso Node.js recolectadas con `prom-client`.
- **Métricas de PostgreSQL (`postgres-exporter:9187`):** Estado del motor (`pg_up`), conexiones activas por base (`pg_stat_activity_count`) y transacciones.
- **Métricas de MongoDB (`mongodb-exporter:9216`):** Disponibilidad (`mongodb_up`), contadores de operaciones documentales (`mongodb_op_counters_total`) y conexiones.
- **Tablero Grafana (`observability/grafana/sonilab-dashboard.json`):** Visualiza réplicas activas, latencia HTTP `p95`, tráfico RPS/errores y salud de ambos motores de datos.

---

## 2. Catálogo de las 5 Alertas Operativas (`observability/prometheus/alert-rules.yaml`)

| # | Alerta | Expresión PromQL | Umbral / Duración | Severidad | Acción Operativa |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `SoniLabAppDown` | `up{job="sonilab-backend"} == 0` | `for: 1m` | `critical` | Verificar `kubectl get pods -n sonilab`, inspeccionar eventos y reiniciar o hacer rollback del Deployment. |
| **2** | `KubernetesNodeNotReady` | `kube_node_status_condition{condition="Ready",status="true"} == 0` | `for: 2m` | `critical` | Revisar `kubectl describe node`, estado del contenedor del nodo en Docker y servicio `kubelet`. |
| **3** | `SoniLabHighErrorRate` | `(sum(rate(http_request_duration_seconds_count{code=~"5.."}[5m])) / clamp_min(sum(rate(http_request_duration_seconds_count[5m])), 1)) * 100 > 5` | `> 5%` por `2m` | `warning` | Consultar `kubectl logs -l app=sonilab-backend` y verificar conectividad con PostgreSQL y MongoDB. |
| **4** | `PodHighResourceSaturation` | `(sum by (pod)(rate(container_cpu_usage_seconds_total{namespace="sonilab"}[2m])) / sum by (pod)(kube_pod_container_resource_limits{namespace="sonilab",resource="cpu"})) * 100 > 85` | `> 85%` por `3m` | `warning` | Comprobar si el HPA alcanzó `maxReplicas: 6` (`kubectl describe hpa sonilab-backend-hpa`). |
| **5** | `DatabaseBackupFailedOrStale` | `(time() - kube_cronjob_status_last_successful_time{cronjob="sonilab-db-backup"} > 93600) or (kube_job_status_failed{job_name=~"sonilab-db-backup.*"} > 0)` | `> 26h` o fallo | `critical` | Revisar logs del último Job de respaldo y espacio libre en `sonilab-backups-pvc`. |

---

## 3. Manual de Respuesta a Incidentes y Pruebas de Fallos (Sección 10 / `E11`)

### Escenario 1: Eliminación Imprevista de un Pod de Backend
1. **Simulación:**
   ```powershell
   $pod = kubectl --context kind-sonilab-prod -n sonilab get pods -l app=sonilab-backend -o jsonpath='{.items[0].metadata.name}'
   kubectl --context kind-sonilab-prod -n sonilab delete pod $pod
   ```
2. **Comportamiento y Verificación:** La segunda réplica alojada en el otro worker continúa atendiendo el 100% de las peticiones sin errores HTTP 5xx, mientras el `ReplicaSet` crea un nuevo Pod en ~4 segundos.

### Escenario 2: Mantenimiento Voluntario de un Nodo Worker (`drain` y `uncordon`)
1. **Ejecución Segura (respetando `PodDisruptionBudget`):**
   ```powershell
   kubectl --context kind-sonilab-prod drain sonilab-prod-worker2 --ignore-daemonsets --delete-emptydir-data
   kubectl --context kind-sonilab-prod get nodes
   kubectl --context kind-sonilab-prod -n sonilab get pods -o wide
   ```
2. **Reincorporación del Nodo:**
   ```powershell
   kubectl --context kind-sonilab-prod uncordon sonilab-prod-worker2
   ```

### Escenario 3: Caída Temporal de la Base No Relacional (MongoDB) y Reconciliación Outbox
1. **Simulación:** Escalar `sonilab-mongo` temporalmente a `0` réplicas o bloquear su red mientras se cierra un préstamo en el taller (`POST /api/loans/:id/close-inspection`).
2. **Efecto Observado:** PostgreSQL confirma la transacción (`RETURNED` / `RETURNED_WITH_DAMAGE`) y guarda el evento en `outbox_events` con `status = 'PENDING'`. El usuario recibe confirmación exitosa sin perder la operación.
3. **Recuperación:** Al volver `sonilab-mongo-0` a estado `Running`, `OutboxService` detecta el evento pendiente en su siguiente ciclo de 5 segundos, inserta el documento en `technical_inspections` de forma idempotente y actualiza `outbox_events.status = 'PROCESSED'`.
