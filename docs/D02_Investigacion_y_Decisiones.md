# D02 — Investigación Técnica de Kubernetes, Comparativa y Decisiones de Arquitectura

## 1. Fundamentos de Kubernetes Aplicados al Proyecto SoniLab

### 1.1 Plano de Control y Nodos Workers
- **Control Plane (`sonilab-prod-control-plane`):** Ejecuta `kube-apiserver` (punto único de entrada REST validando autenticación/RBAC), `etcd` (almacén clave-valor consistente Raft donde reside el estado del clúster), `kube-scheduler` (evalúa `requests`, `topologySpreadConstraints` y `podAntiAffinity` para asignar Pods a `sonilab-prod-worker` y `sonilab-prod-worker2`) y `kube-controller-manager`.
- **Nodos Workers (`sonilab-prod-worker`, `sonilab-prod-worker2`):** Ejecutan `kubelet` (agente que gestiona el ciclo de vida de los contenedores vía `containerd`), `kube-proxy` (reglas `iptables`/`IPVS` para Services) y el agente CNI (`calico-node`).

### 1.2 Pod, Deployment, StatefulSet y Job/CronJob
- **Pod:** Unidad mínima de ejecución; en SoniLab cada Pod ejecuta un contenedor endurecido con su propio namespace de red e IP del CIDR `192.168.0.0/16`.
- **Deployment (`sonilab-backend`, `sonilab-frontend`):** Administra réplicas sin estado intercambiables mediante `ReplicaSet`, permitiendo actualizaciones graduales (`RollingUpdate` con `maxUnavailable: 0, maxSurge: 1`) y `rollback` inmediato.
- **StatefulSet (`sonilab-postgres`, `sonilab-mongo`):** Garantiza identidad de red predecible (`sonilab-postgres-0`, `sonilab-mongo-0`) y asociación estable a su volumen `PersistentVolumeClaim` (`pgdata-sonilab-postgres-0`, `mongodata-sonilab-mongo-0`) mediante `volumeClaimTemplates`.
- **CronJob (`sonilab-db-backup`):** Ejecuta tareas programadas (`0 2 * * *`) para respaldos consistentes con `pg_dump` en un volumen independiente (`sonilab-backups-pvc`).

### 1.3 Service, Descubrimiento DNS, CNI y NetworkPolicy
- **Service (`ClusterIP`) y CoreDNS:** Los Pods del backend se conectan a `sonilab-postgres:5432` y `sonilab-mongo:27017` usando nombres DNS internos resueltos por `CoreDNS` (`kube-system`), desacoplando la aplicación de las IPs efímeras de los Pods.
- **CNI y NetworkPolicy:** Se utiliza **Calico CNI** en producción porque el CNI básico `kindnet` no aplica reglas de `NetworkPolicy`. En `k8s/base/network-policies.yaml` se establece `default-deny-all` (Ingress y Egress) y se abren exclusivamente los puertos requeridos (`53` DNS, `8080` Frontend, `3000` Backend, `5432` PostgreSQL y `27017` MongoDB).

### 1.4 CSI, Almacenamiento, ConfigMap, Secret y RBAC
- **CSI / StorageClass (`standard` — `local-path-provisioner`):** Aprovisiona dinámicamente volúmenes `ReadWriteOnce` (`2Gi`) para ambos motores y para respaldos.
- **ConfigMap y Secret:** Los parámetros no sensibles (`PORT`, `PG_HOST`, scripts SQL/JS de inicialización) viven en `ConfigMap`; las credenciales (`PG_PASSWORD`, `MONGO_PASSWORD`, `JWT_SECRET`) se inyectan desde el `Secret` `sonilab-db-secrets` creado fuera de Git.
- **RBAC y ServiceAccounts:** Cada capa cuenta con su propia `ServiceAccount` (`sonilab-backend-sa`, `sonilab-frontend-sa`, `sonilab-backup-sa`) con `automountServiceAccountToken: false` para impedir acceso innecesario a la API de Kubernetes.

### 1.5 Sondas (`startup`, `readiness`, `liveness`), HPA y PDB
- **Separación de sondas en SoniLab:**
  - `livenessProbe` (`/healthz`): Comprueba únicamente que el proceso Node.js esté vivo. **No consulta las bases de datos**, evitando reinicios masivos en cascada si PostgreSQL o MongoDB sufren una caída temporal.
  - `readinessProbe` (`/ready`): Ejecuta `SELECT 1` en PostgreSQL y `ping` en MongoDB. Si una base cae, devuelve `503 Service Unavailable` y Kubernetes retira el Pod de los `EndpointSlices` del Service sin matar el contenedor.
- **HPA (`sonilab-backend-hpa`):** Escala de `2` a `6` réplicas cuando la utilización promedio de CPU supera el `60%` del `request` (`100m`).
- **PDB (`PodDisruptionBudget`):** Define `minAvailable: 1` en frontend y backend para garantizar disponibilidad continua durante mantenimientos voluntarios (`kubectl drain`).

---

## 2. Comparativa de Tecnologías y Registro de 6 Decisiones de Arquitectura

| # | Decisión | Opción Seleccionada | Alternativa Descartada | Justificación Técnica, Costo y Limitación |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Distribución Kubernetes** | **Kind (Kubernetes in Docker)** multinodo (`v1.37`) | K3s en VMs completas (Hyper-V / VirtualBox) | **Motivo:** Permite desplegar 2 clústeres independientes (`kind-sonilab-dev` de 1 nodo y `kind-sonilab-prod` de 3 nodos) en un mismo host Windows/WSL2 con bajo consumo de RAM (~3.5 GiB totales vs >12 GiB en VMs). **Limitación:** Comparte el kernel del host físico; no aísla fallos de hardware del equipo anfitrión. |
| **2** | **Plugin de Red (CNI)** | **Project Calico (`v3.28`)** | `kindnet` (CNI por defecto de Kind) / Cilium | **Motivo:** `kindnet` no implementa el controlador de `NetworkPolicy` (ignora las reglas de aislamiento). Calico hace cumplir políticas L3/L4 Ingress y Egress con bajo consumo de memoria frente a Cilium con eBPF completo. |
| **3** | **Entrada de Tráfico (Ingress vs Gateway API)** | **Ingress (`networking.k8s.io/v1`) con NGINX Ingress Controller + TLS** | Kubernetes Gateway API (Envoy Gateway) | **Motivo:** Ingress NGINX es estable, ampliamente soportado y ligero para terminar TLS (`dev.sonilab.local` y `prod.sonilab.local`) y enrutar `/api` al backend y `/` al frontend. **Limitación:** Menos expresivo para particionado avanzado de tráfico multi-equipo que Gateway API. |
| **4** | **Persistencia de Datos** | **StatefulSet + PVC (`local-path-provisioner`)** | Operadores pesados (CloudNativePG + Percona Operator) | **Motivo:** Mantiene un consumo de CPU/RAM acotado para laboratorio asegurando identidad estable y persistencia ante recreación de Pods (`E05`). **Limitación:** Un `StatefulSet` con `local-path` ata el volumen al nodo worker donde se creó y no provee replicación automática del motor. |
| **5** | **Motores de Datos y Consistencia** | **PostgreSQL 16 (ACID) + MongoDB 7.0 (JSON Schema) con Patrón Outbox** | Solo PostgreSQL (columnas JSONB) o escritura dual directa sin Outbox | **Motivo:** PostgreSQL protege la integridad referencial y evita doble reserva (`FOR UPDATE`), mientras MongoDB almacena checklists polimórficos por tipo de instrumento. El patrón **Outbox** (`outbox_events`) evita perder inspecciones si MongoDB cae temporalmente. |
| **6** | **Observabilidad** | **Prometheus + Grafana + `prom-client` + Exporters de BD** | Solo `metrics-server` (`kubectl top`) | **Motivo:** `metrics-server` solo retiene métricas instantáneas de CPU/RAM para el HPA. Prometheus y Grafana permiten almacenar series temporales, medir el percentil `p95` de latencia HTTP y evaluar las 5 alertas operativas. |

---

## 3. Respuestas a las Preguntas de Defensa

1. **¿Qué ocurre desde que el usuario abre la URL hasta que se consulta cada base de datos?**
   El navegador resuelve `prod.sonilab.local`, establece el handshake TLS (TCP 443) con el controlador de entrada (o proxy Nginx del frontend), descarga la SPA React y envía peticiones REST con cabecera `Authorization: Bearer <JWT>`. El tráfico hacia `/api/*` se enruta al Service `ClusterIP` `sonilab-backend:3000`, el cual balancea la solicitud hacia uno de los Pods `Ready` distribuido en `sonilab-prod-worker` o `sonilab-prod-worker2`. El Pod valida el JWT, resuelve por CoreDNS `sonilab-postgres.sonilab.svc.cluster.local` (TCP 5432) para operaciones transaccionales relacionales y `sonilab-mongo.sonilab.svc.cluster.local` (TCP 27017) para consultar o sincronizar inspecciones técnicas, todo ello autorizado explícitamente por las `NetworkPolicies`.

2. **¿Qué diferencia existe entre reiniciar un contenedor, recrear un Pod, escalar réplicas y añadir nodos?**
   - *Reiniciar contenedor:* `kubelet` reinicia el proceso dentro del mismo Pod conservando el nombre del Pod, su IP y sus volúmenes montados.
   - *Recrear un Pod:* El controlador (`Deployment`/`StatefulSet`) elimina el Pod anterior y programa uno nuevo con nuevo UID e IP (en `StatefulSet` conserva el nombre `sonilab-postgres-0` y re-adjunta su `PVC`).
   - *Escalar réplicas:* El `Deployment` o `HPA` incrementa el número de Pods en ejecución repartiendo la carga entre los nodos existentes, sin aumentar la CPU/RAM física total del clúster.
   - *Añadir nodos:* Incorpora nuevas máquinas workers al clúster, ampliando la capacidad total de cómputo y memoria disponible para alojar más Pods.

3. **¿Qué seguirá funcionando si falla un Pod, un worker, el control plane o el almacenamiento?**
   - *Fallo de un Pod de backend/frontend:* El Service retira su endpoint de inmediato y la otra réplica absorbe el tráfico sin interrupción mientras el `Deployment` crea un Pod sustituto.
   - *Fallo de un worker:* Las réplicas stateless en el otro worker siguen atendiendo; si el worker caído alojaba el Pod de base de datos con almacenamiento local (`local-path`), las escrituras fallarán hasta que el nodo se recupere o se restaure el respaldo.
   - *Fallo del control plane:* Los Pods, Services e `iptables` en los workers continúan operando y sirviendo tráfico existente, pero no se pueden programar nuevos Pods ni ejecutar escalado HPA hasta recuperar el API server.

4. **¿Cómo se demuestra que una conexión bloqueada falla por la política (`NetworkPolicy`) y no por un servicio caído?**
   Se ejecuta la prueba de control (`tests/test-network-policy.sh` — Evidencia `E08`): desde un Pod no autorizado (`app=intruder`) la conexión TCP hacia `sonilab-postgres:5432` y `sonilab-mongo:27017` expira por timeout (`nc -zv -w 3`), e inmediatamente en el mismo instante se consulta `/ready` desde el Pod autorizado `sonilab-backend`, el cual responde `HTTP 200 {"status":"READY","databases":{"postgres":"OK","mongo":"OK"}}`, demostrando que ambos motores están activos y que el bloqueo proviene exclusivamente de la `NetworkPolicy`.
