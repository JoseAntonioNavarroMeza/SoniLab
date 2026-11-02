# D06 — Plan y Configuración de Seguridad por Capas (RBAC, Flujos, Firewall, TLS y Secretos)

## 1. Matriz de Flujos de Red y Reglas de Firewall / NetworkPolicy

| # | Origen | Destino | Protocolo y Puerto | Control que lo Protege | Condición y Justificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Usuario (Navegador) | Controlador de Entrada / Frontend | `TCP 443` / `8080` | Firewall Host + `Ingress` TLS + `frontend-netpol` | Único punto de entrada público; las bases de datos no tienen `NodePort` ni `LoadBalancer`. |
| **2** | Administrador | API Server Kubernetes (`kind`) | `TCP 6443` (Loopback local) | Firewall de Windows + `kubeconfig` con certificado cliente | Restringido exclusivamente al host de administración (`127.0.0.1`). |
| **3** | Pod `sonilab-frontend` | Service `sonilab-backend` | `TCP 3000` | `frontend-netpol` (Egress) + `backend-netpol` (Ingress) | Permite proxy reverso de peticiones `/api/*`. |
| **4** | Pod `sonilab-backend` | Service `sonilab-postgres` | `TCP 5432` | `backend-netpol` (Egress) + `postgres-netpol` (Ingress) | Solo Pods con etiqueta `app: sonilab-backend`, `sonilab-backup` o `postgres-exporter`. |
| **5** | Pod `sonilab-backend` | Service `sonilab-mongo` | `TCP 27017` | `backend-netpol` (Egress) + `mongo-netpol` (Ingress) | Solo Pods con etiqueta `app: sonilab-backend`, `sonilab-backup` o `mongodb-exporter`. |
| **6** | Todos los Pods `sonilab` | CoreDNS (`kube-system`) | `UDP/TCP 53` | `allow-dns-egress` | Resolución de nombres DNS internos del clúster. |
| **7** | Prometheus | `sonilab-backend` y Exporters | `TCP 3000, 9187, 9216` | `backend-netpol` / Exporters | Recolección de métricas operativas. |

### Reglas de Firewall de Host (Windows Defender Firewall — Exportable)
```powershell
# Permitir únicamente puertos de entrada HTTPS/HTTP de laboratorio para Ingress y bloquear acceso externo directo a puertos de BD
New-NetFirewallRule -DisplayName "SoniLab-Allow-HTTPS-Prod" -Direction Inbound -Protocol TCP -LocalPort 9443 -Action Allow
New-NetFirewallRule -DisplayName "SoniLab-Allow-HTTPS-Dev"  -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
New-NetFirewallRule -DisplayName "SoniLab-Block-External-Postgres" -Direction Inbound -Protocol TCP -LocalPort 5432,5433 -RemoteAddress Any -Action Block
New-NetFirewallRule -DisplayName "SoniLab-Block-External-Mongo"    -Direction Inbound -Protocol TCP -LocalPort 27017 -RemoteAddress Any -Action Block
```

---

## 2. Seguridad por Capa e Implementación en SoniLab

| Capa | Control Implementado | Archivo / Evidencia en el Repositorio |
| :--- | :--- | :--- |
| **Aplicación** | Hash `bcrypt` (10 rondas), JWT firmado con expiración, validación RBAC (`ADMIN`/`STUDENT`), consultas SQL 100% parametrizadas (`$1, $2`) y bloqueo tras 5 intentos fallidos (`HTTP 429`). | `backend/src/controllers/auth.controller.js`, `middlewares/auth.middleware.js` |
| **Contenedores** | Ejecución sin root (`USER 10001` en backend, `USER 101` en frontend), `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: drop: ["ALL"]`, `seccompProfile: RuntimeDefault`. | `backend/Dockerfile`, `frontend/Dockerfile`, `k8s/base/backend/deployment.yaml` |
| **Kubernetes y RBAC** | `ServiceAccount` dedicadas (`sonilab-backend-sa`, `sonilab-frontend-sa`, `sonilab-backup-sa`) con `automountServiceAccountToken: false` y `Role` `sonilab-operator-role` de solo lectura. | `k8s/base/namespace-security.yaml` |
| **Secretos** | Ningún manifiesto en Git contiene contraseñas. El secreto `sonilab-db-secrets` se inyecta de forma imperativa por ambiente (`dev` y `prod` usan contraseñas distintas). | `k8s/base/backend/deployment.yaml` (`secretKeyRef`) |

---

## 3. Procedimiento de Creación y Rotación de Secretos y Certificados TLS

### 3.1 Generación de Certificados TLS para `dev.sonilab.local` y `prod.sonilab.local`
```powershell
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout tls-prod.key -out tls-prod.crt `
  -subj "/CN=prod.sonilab.local/O=SoniLab-ITM"

kubectl --context kind-sonilab-prod -n sonilab create secret tls sonilab-prod-tls `
  --cert=tls-prod.crt --key=tls-prod.key
Remove-Item tls-prod.key, tls-prod.crt
```

### 3.2 Registro de Riesgos Residuales y Excepciones Técnicas Justificadas
| Riesgo / Excepción | Impacto | Justificación Técnica y Mitigación | Responsable |
| :--- | :--- | :--- | :--- |
| Imágenes oficiales `postgres:16-alpine` y `mongo:7.0` requieren inicializar permisos de directorio antes de bajar privilegios (`baseline` vs `restricted`). | Medio | Las cargas propias (`sonilab-backend` y `sonilab-frontend`) cumplen el perfil **Restricted** al 100%. Las bases oficiales operan bajo política de red estricta (`postgres-netpol` y `mongo-netpol`) sin exposición externa. | Administrador de Infraestructura |
| Clústeres Kind alojados sobre un único host físico. | Alto ante apagado del host | Permite demostrar programación multinodo, anti-afinidad y drenado de workers (`kubectl drain`), documentándose el host físico como punto único de fallo de hardware. | Operador de Laboratorio |
