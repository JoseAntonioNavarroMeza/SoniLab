# D05 — Manual de Instalación Paso a Paso desde Cero (Desarrollo y Producción)

Este manual sigue la plantilla oficial de la Sección 8 y 14 del documento rector para que cualquier evaluador pueda reconstruir ambos ambientes desde un equipo limpio.

---

## Paso 1 — Preparar Equipo y Verificar Dependencias
- **Objetivo:** Validar recursos del host, Docker Engine, `kubectl` y `kind`.
- **Requisitos previos:** Windows 10/11 con WSL2 o Linux x86_64, mínimo 8 GiB de RAM libre y 20 GiB de disco.
- **Comando exacto ejecutado:**
```powershell
docker --version
kubectl version --client
kind --version
```
- **Resultado esperado:** Versiones activas de Docker (`>= 26.x`), `kubectl` (`>= v1.30`) y `kind` (`>= v0.23`).
- **Error posible y diagnóstico:** Si `kind` no se reconoce en PowerShell, instalar con `winget install Kubernetes.kind` y reiniciar la terminal.

---

## Paso 2 — Construir Imágenes de Contenedores de la Aplicación
- **Objetivo:** Generar las imágenes inmutables `sonilab-backend:1.0.0` (Node 20 Alpine no-root) y `sonilab-frontend:1.0.0` (Nginx Unprivileged 1.27 Alpine no-root).
- **Archivos:** `backend/Dockerfile`, `backend/.dockerignore`, `frontend/Dockerfile`, `frontend/nginx.conf`.
- **Comando exacto ejecutado:**
```powershell
docker build -t sonilab-backend:1.0.0 ./backend
docker build -t sonilab-frontend:1.0.0 ./frontend
```
- **Comprobación de éxito:**
```powershell
docker images | Select-String "sonilab-"
```
- **Procedimiento de reversión:** `docker rmi sonilab-backend:1.0.0 sonilab-frontend:1.0.0`.

---

## Paso 3 — Crear los Dos Clústeres Independientes (`dev` y `prod`)
- **Objetivo:** Aprovisionar el clúster de desarrollo (`kind-sonilab-dev`, 1 nodo) y el clúster de producción (`kind-sonilab-prod`, 1 control-plane + 2 workers).
- **Archivos:** `k8s/kind-dev.yaml` y `k8s/kind-prod.yaml`.
- **Comando exacto ejecutado:**
```powershell
kind create cluster --config k8s/kind-dev.yaml
kind create cluster --config k8s/kind-prod.yaml
```
- **Comprobación de éxito (Evidencia `E01`):**
```powershell
kubectl config get-contexts
kubectl --context kind-sonilab-dev get nodes -o wide
kubectl --context kind-sonilab-prod get nodes -o wide
```
- **Procedimiento de reversión:** `kind delete cluster --name sonilab-dev` y `kind delete cluster --name sonilab-prod`.

---

## Paso 4 — Habilitar Plataforma en Producción (Calico CNI y Metrics Server)
- **Objetivo:** Instalar el CNI Calico en `kind-sonilab-prod` para cumplimiento real de `NetworkPolicy` e instalar `metrics-server` para el HPA.
- **Ambiente y contexto:** `kind-sonilab-prod`.
- **Comando exacto ejecutado:**
```powershell
kubectl --context kind-sonilab-prod apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
kubectl --context kind-sonilab-prod apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl --context kind-sonilab-prod -n kube-system patch deployment metrics-server --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```
- **Comprobación de éxito:**
```powershell
kubectl --context kind-sonilab-prod -n kube-system get pods -l k8s-app=calico-node
kubectl --context kind-sonilab-prod top nodes
```

---

## Paso 5 — Cargar Imágenes Locales en Ambos Clústeres
- **Objetivo:** Distribuir las imágenes `sonilab-backend:1.0.0` y `sonilab-frontend:1.0.0` hacia los nodos de ambos clústeres sin depender de un registro externo público.
- **Comando exacto ejecutado:**
```powershell
kind load docker-image sonilab-backend:1.0.0 sonilab-frontend:1.0.0 --name sonilab-dev
kind load docker-image sonilab-backend:1.0.0 sonilab-frontend:1.0.0 --name sonilab-prod
```

---

## Paso 6 — Crear Secretos Fuera de Git y Desplegar Ambiente de Desarrollo (`dev`)
- **Objetivo:** Desplegar el overlay `k8s/overlays/dev` (1 réplica por servicio) en `kind-sonilab-dev`.
- **Archivos:** `k8s/overlays/dev/kustomization.yaml`, `k8s/base/*`.
- **Comando exacto ejecutado:**
```powershell
kubectl --context kind-sonilab-dev apply -k k8s/overlays/dev

kubectl --context kind-sonilab-dev -n sonilab create secret generic sonilab-db-secrets `
  --from-literal=PG_USER=sonilab_user `
  --from-literal=PG_PASSWORD=<PASSWORD_DEV_PG> `
  --from-literal=MONGO_USER=root `
  --from-literal=MONGO_PASSWORD=<PASSWORD_DEV_MONGO> `
  --from-literal=DATABASE_URL="postgresql://sonilab_user:<PASSWORD_DEV_PG>@sonilab-postgres:5432/sonilab_db" `
  --from-literal=MONGO_URL="mongodb://root:<PASSWORD_DEV_MONGO>@sonilab-mongo:27017/sonilab_docs?authSource=admin" `
  --from-literal=JWT_SECRET="<JWT_SECRET_DEV>"
```
- **Comprobación de éxito:**
```powershell
kubectl --context kind-sonilab-dev -n sonilab get pods,svc,pvc -o wide
```

---

## Paso 7 — Promover y Desplegar Ambiente de Producción (`prod`)
- **Objetivo:** Desplegar el overlay `k8s/overlays/prod` (2 réplicas iniciales distribuidas entre workers, HPA 2–6, PDB y NetworkPolicies) con credenciales independientes.
- **Archivos:** `k8s/overlays/prod/kustomization.yaml`, `hpa.yaml`, `pdb.yaml`, `patches-ha.yaml`.
- **Comando exacto ejecutado:**
```powershell
kubectl --context kind-sonilab-prod apply -k k8s/overlays/prod

kubectl --context kind-sonilab-prod -n sonilab create secret generic sonilab-db-secrets `
  --from-literal=PG_USER=sonilab_user `
  --from-literal=PG_PASSWORD=<PASSWORD_PROD_PG> `
  --from-literal=MONGO_USER=root `
  --from-literal=MONGO_PASSWORD=<PASSWORD_PROD_MONGO> `
  --from-literal=DATABASE_URL="postgresql://sonilab_user:<PASSWORD_PROD_PG>@sonilab-postgres:5432/sonilab_db" `
  --from-literal=MONGO_URL="mongodb://root:<PASSWORD_PROD_MONGO>@sonilab-mongo:27017/sonilab_docs?authSource=admin" `
  --from-literal=JWT_SECRET="<JWT_SECRET_PROD>"
```
- **Comprobación de éxito:**
```powershell
kubectl --context kind-sonilab-prod -n sonilab get pods,svc,pvc,hpa,pdb,networkpolicy -o wide
```
