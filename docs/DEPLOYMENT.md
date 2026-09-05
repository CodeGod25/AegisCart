# Deployment

AegisCart can be deployed in various environments: bare metal, virtual machines, containers, or orchestration platforms like Kubernetes.

## Prerequisites

- Node.js >= 20.x
- npm >= 9.x
- For containerized deployment: Docker >= 24.x
- For Kubernetes: kubectl access to a cluster

## Build the Application

### Install Dependencies
```bash
npm install
```

### Type Check
```bash
npm run check
```

### Build
```bash
npm run build
```
This compiles TypeScript to JavaScript in the `dist/` directory.

## Running the Server

### Development
```bash
npm run dev
```
Uses `tsx` to watch and reload TypeScript files.

### Production
```bash
npm start
```
Runs the compiled JavaScript from `dist/`.

## Docker Deployment

AegisCart includes a multi-stage Dockerfile for building small, secure images.

### Build the Image
```bash
docker build -t aegiscart:latest .
```

### Run the Container
```bash
docker run --name aegiscart \
  --env-file .env \
  -p 4000:4000 \
  --restart unless-stopped \
  aegiscart:latest
```

### Docker Compose
The provided `docker-compose.yml` simplifies local development:

```bash
docker-compose up
```

To use a specific environment file with compose, override the env_file:

```yaml
# docker-compose.override.yml
services:
  app:
    env_file:
      - .env.staging
```

## Kubernetes Deployment

The `kubernetes/` directory contains manifests for deploying AegisCart to a Kubernetes cluster.

### Prerequisites
- A Kubernetes cluster (v1.24+ recommended)
- `kubectl` configured to access the cluster
- A container registry accessible from the cluster

### Steps

1. **Build and Push Docker Image**
   ```bash
   docker build -t your-registry/aegiscart:latest .
   docker push your-registry/aegiscart:latest
   ```

2. **Create Secrets**
   ```bash
   kubectl create secret generic aegiscart-secrets \
     --from-literal=AEGIS_SIGNING_SECRET="your-secret" \
     --from-literal=LLM_API_KEY="your-llm-key" \
     --from-literal=RAZORPAY_KEY_ID="your-razorpay-key-id" \
     --from-literal=RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
   ```

3. **Apply ConfigMaps and Secrets**
   ```bash
   kubectl apply -f kubernetes/configmap.yaml
   kubectl apply -f kubernetes/secret.yaml
   ```

4. **Deploy**
   ```bash
   kubectl apply -f kubernetes/deployment.yaml
   kubectl apply -f kubernetes/pvc.yaml   # if using persistent volume claim
   ```

5. **Expose the Service**
   ```bash
   kubectl apply -f kubernetes/service.yaml   # if not included in deployment.yaml
   ```

### Scaling
Adjust the replica count in `deployment.yaml`:
```yaml
spec:
  replicas: 3
```

### Rolling Updates
Kubernetes handles rolling updates automatically when you change the image tag.

## Configuration in Deployment

### Environment Variables
All configuration is done via environment variables. In Docker, use `--env-file` or `-e` flags. In Kubernetes, define them in the Deployment manifest under `env:` or `envFrom:`.

### Persistent Storage
The SQLite database requires persistent storage. In Kubernetes, use a PersistentVolumeClaim (see `pvc.yaml`). The mount path is `/app/data` by default.

### Resource Limits
Define resource requests and limits in the Deployment manifest to ensure stable performance.

## Reverse Proxy and TLS

It is recommended to terminate TLS at a reverse proxy or load balancer.

### Example with Nginx
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Example with Traefik (Kubernetes Ingress)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aegiscart-ingress
  annotations:
    traefik.ingress.kubernetes.io/router.tls: "true"
spec:
  tls:
    - hosts:
        - your-domain.com
      secretName: aegiscart-tls
  rules:
    - host: your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aegiscart-service
                port:
                  number: 4000
    ```

## Health Checks

Configure your orchestration platform to use the `/health` endpoint for liveness and readiness probes.

### Kubernetes Example
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Logging

AegisCart outputs structured logs to stdout/stderr, suitable for container logging drivers.

### Example with Docker Logging Driver
```bash
docker run --log-driver=json-file --log-opt max-size=10m --log-opt max-file=3 ...
```

## Monitoring

Export metrics via the `/metrics` endpoint. Use a Prometheus scraper or similar tool.

## Backup and Recovery

See [BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) for database backup procedures.

## Rollback Strategy

Since AegisCart uses immutable artifacts:

1. **Docker/Kubernetes**: Roll back to the previous image tag.
2. **Database**: The SQLite schema is backward-compatible (only additive changes). If a migration breaks compatibility, restore from backup.
3. **Configuration**: Keep previous `.env` files versioned (but not committed) for reference.

## CI/CD Integration

The provided GitHub Actions workflow (`.github/workflows/ci-cd.yml`) demonstrates:
- Building Docker images
- Pushing to a container registry
- Deploying to staging/production environments (placeholders)

Customize the deployment steps for your target platform.

## Security Considerations

1. **Run as non-root**: The Dockerfile runs the application as a non-root user.
2. **Limit capabilities**: Drop Linux capabilities in containers if possible.
3. **Network policies**: Restrict egress traffic to only necessary endpoints (Razorpay, LLM API).
4. **Secrets management**: Never mount secret files; use environment variables from a secrets manager.
5. **Read-only root filesystem**: Consider running containers with a read-only root filesystem and explicit writeable volumes for logs/data.
