# SoniLab — Sistema de Control de Préstamos y Trazabilidad de Instrumentos Musicales

Proyecto integrador de **Infraestructura de Servicios** (Tecnológico Nacional de México — Instituto Tecnológico de Morelia).  
**Alumno:** José Antonio Navarro Meza | **Asesor:** Roque Trujillo Ramos

---

## 1. Arquitectura y Estructura del Repositorio

```text
sonilab/
├── backend/                  # API REST sin estado (Node.js/Express, JWT, Outbox Worker, Prometheus /metrics)
├── frontend/                 # SPA React/Vite + Tailwind CSS empaquetada con Nginx Unprivileged (:8080)
├── database/
│   ├── postgres/             # 01_schema.sql (ACID) y 02_seed.sql (120 instrumentos + 3 usuarios)
│   └── mongo/                # 01_init.js ($jsonSchema validator e índice único en technical_inspections)
├── k8s/
│   ├── kind-dev.yaml         # Topología Clúster Desarrollo (1 nodo)
│   ├── kind-prod.yaml        # Topología Clúster Producción (1 control-plane + 2 workers + Calico CNI)
│   ├── base/                 # Namespace, RBAC, NetworkPolicies, StatefulSets (PG/Mongo), Deployments, CronJob
│   └── overlays/
│       ├── dev/              # Overlay Desarrollo (1 réplica, Ingress TLS dev.sonilab.local)
│       └── prod/             # Overlay Producción (2 réplicas, anti-afinidad, HPA 2-6, PDB, Ingress TLS)
├── observability/            # Exporters (Postgres/Mongo), Prometheus, 5 Alertas operativas y Dashboard Grafana
├── tests/                    # Scripts de carga (load-test.js), NetworkPolicy (E08) y Respaldo/Restauración (E13)
└── docs/                     # Expediente Técnico completo D01 a D10
```

---

## 2. Credenciales de Prueba (Semilla Controlada)

| Rol | Correo | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@sonilab.edu` | `admin1234` | Gestión de inventario, usuarios, aprobación/rechazo e inspección técnica hacia MongoDB. |
| **STUDENT** | `juan.perez@sonilab.edu` | `alumno123` | Consulta de catálogo, solicitud de préstamos (`RN01`/`RN02`) y visualización de sus propias inspecciones. |
| **STUDENT** | `maria.lopez@sonilab.edu` | `alumno123` | Consulta de catálogo, solicitud de préstamos (`RN01`/`RN02`) y visualización de sus propias inspecciones. |

---

## 3. Inicio Rápido en Kubernetes (`kind-sonilab-prod`)

```powershell
# 1. Construir imágenes inmutables
docker build -t sonilab-backend:1.0.0 ./backend
docker build -t sonilab-frontend:1.0.0 ./frontend

# 2. Verificar Pods en el clúster productivo y abrir túnel al Frontend
kubectl --context kind-sonilab-prod -n sonilab get pods,svc,pvc,hpa -o wide
kubectl --context kind-sonilab-prod -n sonilab port-forward svc/sonilab-frontend 8080:8080
```
Abrir en el navegador: **`http://localhost:8080`**

---

## 4. Índice del Expediente Técnico (`docs/`)
- [`D01` — Ficha Técnica y Requerimientos Funcionales/No Funcionales](docs/D01_Ficha_y_Requerimientos.md)
- [`D02` — Investigación de Kubernetes, Comparativa y 6 Decisiones de Arquitectura](docs/D02_Investigacion_y_Decisiones.md)
- [`D03` — Arquitecturas, Diagramas de Secuencia y Presupuesto de Capacidad](docs/D03_Arquitecturas_Diagramas_y_Capacidad.md)
- [`D04` — Modelos de Datos (ER y NoSQL), Diccionarios y Consistencia Outbox](docs/D04_Modelos_Diccionarios_y_Consistencia.md)
- [`D05` — Manual de Instalación Paso a Paso desde Cero](docs/D05_Manual_Instalacion_Desde_Cero.md)
- [`D06` — Plan de Seguridad por Capas, RBAC, Firewall y NetworkPolicies](docs/D06_Plan_y_Configuracion_Seguridad.md)
- [`D07` — Manual de Publicación, Promoción, Rolling Update y Rollback](docs/D07_Manual_Publicacion_Rollout_y_Rollback.md)
- [`D08` — Manual de Operación, Observabilidad, 5 Alertas e Incidentes](docs/D08_Manual_Operacion_Observabilidad_e_Incidentes.md)
- [`D09` — Plan de Respaldos, Restauración Aislada y Medición de RPO/RTO](docs/D09_Plan_Respaldos_Restauracion_y_Continuidad.md)
- [`D10` — Plan de Pruebas y Matriz de Evidencias `E01`–`E14`](docs/D10_Pruebas_Evidencias_y_Conclusiones.md)
