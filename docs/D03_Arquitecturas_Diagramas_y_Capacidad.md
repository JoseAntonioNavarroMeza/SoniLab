# D03 — Arquitecturas, Diagramas Obligatorios y Planeación de Capacidad

## 1. Arquitectura de la Aplicación Multicapa
```mermaid
flowchart LR
    subgraph Cliente["Navegador Web (SPA React/Vite)"]
        UI["Panel SoniLab\n(ADMIN / STUDENT)"]
    end

    subgraph Entrada["Capa de Presentación / Entrada"]
        NGINX["Nginx Unprivileged (:8080)\nArchivos Estáticos + Proxy /api"]
    end

    subgraph Negocio["Capa de Negocio (Node.js / Express :3000)"]
        AUTH["Middleware JWT + RBAC\n+ Rate Limiter"]
        CTRL_INST["Controlador Instrumentos\n(Catálogo / CRUD)"]
        CTRL_LOAN["Controlador Préstamos\n(RN01, RN02, RN03)"]
        CTRL_INSP["Controlador Inspecciones\n(Lectura NoSQL)"]
        OUTBOX["Outbox Worker Asíncrono\n(Reconciliación Idempotente)"]
        PROM["Endpoint /metrics\n(prom-client)"]
    end

    subgraph Datos["Capa de Persistencia Políglota"]
        PG[("PostgreSQL 16 (:5432)\nsonilab_db (Fuente de Verdad)\nusers, instruments, loans, outbox_events")]
        MONGO[("MongoDB 7.0 (:27017)\nsonilab_docs\ntechnical_inspections, loan_audit_log")]
    end

    UI -- "HTTPS / HTTP" --> NGINX
    NGINX -- "REST /api/* (TCP 3000)" --> AUTH
    AUTH --> CTRL_INST & CTRL_LOAN & CTRL_INSP
    CTRL_INST -- "SQL Parametrizado" --> PG
    CTRL_LOAN -- "Transacción ACID\n(BEGIN + FOR UPDATE + COMMIT)" --> PG
    OUTBOX -- "1. Lee PENDING_SYNC" --> PG
    OUTBOX -- "2. Upsert Int32/Date ($jsonSchema)" --> MONGO
    CTRL_INSP -- "Consulta bitácora" --> MONGO
    CTRL_INSP -- "Enriquece datos" --> PG
```

---

## 2. Diagramas de Secuencia

### 2.1 Secuencia de un CRUD y Solicitud de Préstamo (Transacción ACID en PostgreSQL)
```mermaid
sequenceDiagram
    actor Alumno as Estudiante (STUDENT)
    participant SPA as Frontend React
    participant API as Backend API (Express)
    participant PG as PostgreSQL (sonilab_db)

    Alumno->>SPA: Selecciona instrumento AVAILABLE y fechas
    SPA->>API: POST /api/loans/request (Bearer JWT)
    API->>API: Verifica firma JWT y rol STUDENT
    API->>PG: BEGIN TRANSACTION
    API->>PG: SELECT id FROM loans WHERE user_id=$1 AND status IN ('PENDING','APPROVED','IN_INSPECTION')
    alt Alumno ya tiene préstamo activo (RN01)
        API->>PG: ROLLBACK
        API-->>SPA: HTTP 400 Violación RN01
    else Sin préstamo activo
        API->>PG: SELECT status, active FROM instruments WHERE id=$1 FOR UPDATE
        alt Instrumento en MAINTENANCE o BORROWED (RN02)
            API->>PG: ROLLBACK
            API-->>SPA: HTTP 409 Violación RN02
        else Instrumento AVAILABLE
            API->>PG: INSERT INTO loans (..., status='PENDING') RETURNING *
            API->>PG: COMMIT
            API-->>SPA: HTTP 201 Solicitud creada
        end
    end
```

### 2.2 Secuencia de Cierre con Inspección Técnica (Ambos Motores + Patrón Outbox y Recuperación)
```mermaid
sequenceDiagram
    actor Admin as Encargado (ADMIN)
    participant SPA as Frontend React
    participant API as Backend API
    participant Worker as OutboxService
    participant PG as PostgreSQL (Fuente de Verdad)
    participant MG as MongoDB (sonilab_docs)

    Admin->>SPA: Evalúa checklist físico, registra observaciones y pulsa "Cerrar y Sincronizar"
    SPA->>API: POST /api/loans/:id/close-inspection { checklist, passed, notes }
    API->>PG: BEGIN TRANSACTION
    API->>PG: UPDATE loans SET status = 'RETURNED' (o 'RETURNED_WITH_DAMAGE')
    API->>PG: UPDATE instruments SET status = 'AVAILABLE' (o 'MAINTENANCE')
    API->>PG: INSERT INTO outbox_events (event_type='LOAN_RETURNED_INSPECTION', status='PENDING')
    API->>PG: COMMIT
    API->>Worker: processPendingEvents()
    alt MongoDB Disponible
        Worker->>MG: updateOne({ loan_id }, { $set: {...} }, { upsert: true })
        Worker->>MG: updateOne loan_audit_log (upsert idempotente)
        Worker->>PG: UPDATE outbox_events SET status='PROCESSED'
        API-->>SPA: HTTP 200 Préstamo cerrado y sincronizado
    else Fallo Temporal en MongoDB
        Worker->>PG: UPDATE outbox_events SET retry_count = retry_count + 1
        API-->>SPA: HTTP 200 Préstamo cerrado en PostgreSQL (Outbox encolado)
        Note over Worker,MG: El Worker reintenta cada 5s hasta sincronizar sin duplicados (índice único loan_id)
    end
```

---

## 3. Arquitectura de Implementación por Ambiente (Desarrollo vs Producción)

```mermaid
flowchart TB
    subgraph DevCluster["Clúster 1: kind-sonilab-dev (Desarrollo - 1 Nodo)"]
        subgraph DevNode["sonilab-dev-control-plane"]
            DEV_ING["Ingress HTTPS (dev.sonilab.local)"]
            DEV_FE["Deployment: sonilab-frontend (1 réplica)"]
            DEV_BE["Deployment: sonilab-backend (1 réplica)"]
            DEV_PG["StatefulSet: sonilab-postgres-0 + PVC 2Gi"]
            DEV_MG["StatefulSet: sonilab-mongo-0 + PVC 2Gi"]
        end
        DEV_ING --> DEV_FE & DEV_BE
        DEV_BE --> DEV_PG & DEV_MG
    end

    subgraph ProdCluster["Clúster 2: kind-sonilab-prod (Producción - 1 Control Plane + 2 Workers)"]
        subgraph ProdCP["sonilab-prod-control-plane"]
            API_SRV["kube-apiserver / etcd / scheduler"]
            CALICO_CTRL["calico-kube-controllers"]
        end
        subgraph Worker1["sonilab-prod-worker"]
            PROD_FE1["Pod: sonilab-frontend #1"]
            PROD_BE1["Pod: sonilab-backend #1"]
            PROD_PG["StatefulSet: sonilab-postgres-0 + PVC 2Gi"]
            PROD_MG["StatefulSet: sonilab-mongo-0 + PVC 2Gi"]
        end
        subgraph Worker2["sonilab-prod-worker2"]
            PROD_FE2["Pod: sonilab-frontend #2"]
            PROD_BE2["Pod: sonilab-backend #2..#6 (HPA 2-6)"]
            BACKUP_CJ["CronJob: sonilab-db-backup + PVC 2Gi"]
        end
    end
```

---

## 4. Arquitectura de Comunicación y Red

| Parámetro de Red | Clúster Desarrollo (`kind-sonilab-dev`) | Clúster Producción (`kind-sonilab-prod`) |
| :--- | :--- | :--- |
| **Red Docker de Nodos** | `172.22.0.0/16` (`172.22.0.5`) | `172.22.0.0/16` (`172.22.0.2`, `.3`, `.4`) |
| **CIDR de Pods** | `10.244.0.0/16` | `192.168.0.0/16` (Calico CNI) |
| **CIDR de Services** | `10.96.0.0/12` | `10.96.0.0/12` |
| **DNS Interno** | `CoreDNS` (`10.96.0.10:53`) | `CoreDNS` (`10.96.0.10:53`) |
| **Dominio / Entrada** | `https://dev.sonilab.local` (`:8443`) | `https://prod.sonilab.local` (`:9443`) |

---

## 5. Inventario de Equipos y Presupuesto de Capacidad

### 5.1 Inventario del Equipo Anfitrión y Nodos del Clúster
| Nodo / Rol | Ambiente | SO / Imagen Base | Kernel / Runtime | IP Interna | Presupuesto Asignado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sonilab-dev-control-plane` | Desarrollo | Debian GNU/Linux 13 (trixie) | Linux 6.18 WSL2 / `containerd://2.3.4` | `172.22.0.5` | 2 vCPU / 2 GiB RAM |
| `sonilab-prod-control-plane` | Producción | Debian GNU/Linux 13 (trixie) | Linux 6.18 WSL2 / `containerd://2.3.4` | `172.22.0.3` | 2 vCPU / 2 GiB RAM |
| `sonilab-prod-worker` | Producción | Debian GNU/Linux 13 (trixie) | Linux 6.18 WSL2 / `containerd://2.3.4` | `172.22.0.4` | 4 vCPU / 4 GiB RAM |
| `sonilab-prod-worker2` | Producción | Debian GNU/Linux 13 (trixie) | Linux 6.18 WSL2 / `containerd://2.3.4` | `172.22.0.2` | 4 vCPU / 4 GiB RAM |

### 5.2 Presupuesto de Recursos por Componente en Producción (`namespace: sonilab`)
| Componente | Réplicas (Mín–Máx) | CPU Request | CPU Limit | RAM Request | RAM Limit | Consumo Máximo Total (Escala Máxima) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sonilab-frontend` | 2 | `50m` | `200m` | `64Mi` | `128Mi` | `400m` CPU / `256Mi` RAM |
| `sonilab-backend` (con HPA) | 2 a 6 | `100m` | `400m` | `128Mi` | `256Mi` | `2400m` CPU / `1536Mi` RAM |
| `sonilab-postgres` | 1 | `150m` | `500m` | `256Mi` | `512Mi` | `500m` CPU / `512Mi` RAM |
| `sonilab-mongo` | 1 | `150m` | `500m` | `256Mi` | `512Mi` | `500m` CPU / `512Mi` RAM |
| Exporters (`pg` + `mongo`) | 2 | `50m` c/u | `150m` c/u | `64Mi` c/u | `128Mi` c/u | `300m` CPU / `256Mi` RAM |
| **Total Aplicativo** | **8 a 12 Pods** | **`600m` (base)** | **`4.1 vCPU` (pico)** | **`896Mi` (base)** | **`3.0 GiB` (pico)** | Dentro de `ResourceQuota` (`6 CPU req / 12 CPU lim`) |
