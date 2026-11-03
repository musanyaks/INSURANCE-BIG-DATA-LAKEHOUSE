# Kubernetes Manifests

Deployment path for the lakehouse serving + batch layers.

| File | Contents |
|---|---|
| `00-namespace.yaml` | `insurance-lakehouse` namespace |
| `10-kafka.yaml` | Strimzi `Kafka` (KRaft) + the 4 event topics |
| `20-postgres.yaml` | PostgreSQL StatefulSet (system of record) |
| `30-api.yaml` | FastAPI serving Deployment ×2 + Service |
| `40-dashboard.yaml` | Streamlit dashboard Deployment + Service |
| `50-spark-cronjob.yaml` | Nightly gold-mart `spark-submit` CronJob |

## Apply

```bash
kubectl apply -f 00-namespace.yaml
kubectl create secret generic object-store \
    --from-literal=access-key=minioadmin \
    --from-literal=secret-key=minioadmin   # replace with IRSA/CSI driver in prod
kubectl apply -f 10-kafka.yaml -f 20-postgres.yaml
kubectl apply -f 30-api.yaml -f 40-dashboard.yaml -f 50-spark-cronjob.yaml
```

## Notes

* Images referenced as `ghcr.io/meridian/lakehouse-*` — build them from
  `infrastructure/docker/Dockerfile.*` and push (or use your registry).
* For object storage, prefer **IRSA** (IAM Roles for Service Accounts) over
  static secrets in production.
* Kafka runs in KRaft mode with ephemeral storage for the demo; switch to
  persistent `jvm`/`storage` specs for anything real.
