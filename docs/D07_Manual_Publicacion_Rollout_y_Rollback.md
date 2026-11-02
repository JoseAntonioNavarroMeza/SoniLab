# D07 — Manual de Publicación, Promoción, Actualización Gradual y Rollback

## 1. Flujo de Promoción entre Ambientes (`dev` → `prod`)
1. El código se empaqueta en una imagen inmutable etiquetada por versión (`sonilab-backend:1.0.0`, `sonilab-frontend:1.0.0`).
2. Se despliega primero en `kind-sonilab-dev` usando `kubectl --context kind-sonilab-dev apply -k k8s/overlays/dev`.
3. Tras aprobar las pruebas funcionales (`CRUD`, reglas `RN01–RN03`, sincronización Outbox a MongoDB), se promueve **el mismo artefacto de imagen** a `kind-sonilab-prod` aplicando únicamente el overlay productivo (`k8s/overlays/prod`), el cual añade las 2 réplicas mínimas, anti-afinidad, PDB y HPA.

---

## 2. Procedimiento de Actualización Gradual (Rolling Update — Evidencia `E12`)

En `k8s/overlays/prod/patches-ha.yaml`, la estrategia configurada es:
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```
Esto garantiza que Kubernetes cree primero un Pod nuevo con la versión actualizada, espere a que su `readinessProbe` (`/ready`) responda `200 OK`, y solo entonces termine el Pod de la versión anterior (**cero tiempo de inactividad**).

### Comandos Exactos para Ejecutar una Actualización a `v1.1.0`:
```powershell
# 1. Construir y etiquetar nueva revisión
docker build -t sonilab-backend:1.1.0 ./backend
kind load docker-image sonilab-backend:1.1.0 --name sonilab-prod

# 2. Actualizar la imagen del Deployment y observar el progreso gradual
kubectl --context kind-sonilab-prod -n sonilab set image deployment/sonilab-backend backend=sonilab-backend:1.1.0
kubectl --context kind-sonilab-prod -n sonilab rollout status deployment/sonilab-backend
kubectl --context kind-sonilab-prod -n sonilab rollout history deployment/sonilab-backend
```

---

## 3. Procedimiento de Reversión (Rollback — Evidencia `E12`)

Si una nueva versión presenta degradación en las métricas de error o falla la sonda `/ready`, se revierte inmediatamente a la revisión estable anterior:

```powershell
# 1. Ejecutar rollback a la revisión inmediata anterior
kubectl --context kind-sonilab-prod -n sonilab rollout undo deployment/sonilab-backend

# 2. Verificar que el estado vuelva a ser estable y comprobar la imagen activa
kubectl --context kind-sonilab-prod -n sonilab rollout status deployment/sonilab-backend
kubectl --context kind-sonilab-prod -n sonilab get deployment sonilab-backend -o jsonpath='{.spec.template.spec.containers[0].image}'
```

> **Nota sobre compatibilidad de esquema de base de datos:** El `rollout undo` de un `Deployment` revierte el código contenedorizado pero **no revierte cambios destructivos en la base de datos**. Por ello, toda migración SQL en SoniLab sigue el patrón *Expand-and-Contract* (adición de columnas opcionales o nuevas colecciones sin eliminar campos requeridos por la versión inmediata anterior).
