# Kubernetes Manifests for AegisCart

This directory contains Kubernetes manifests for deploying the AegisCart application.

## Files

- `deployment.yaml`: Deployment and Service definitions
- `secret.yaml`: Template for sensitive configuration (fill in the secrets)
- `configmap.yaml`: Configuration for non-sensitive settings
- `pvc.yaml`: PersistentVolumeClaim for the SQLite database

## Usage

1. Fill in the secret values in `secret.yaml` (base64 encoded)
   - You can generate base64 values using: `echo -n "your-value" | base64`

2. Apply the manifests in the following order:
   ```bash
   kubectl apply -f pvc.yaml
   kubectl apply -f configmap.yaml
   kubectl apply -f secret.yaml
   kubectl apply -f deployment.yaml
   ```

3. Adjust the number of replicas, resource limits, and other settings as needed for your environment.

## Notes

- The deployment uses a PersistentVolumeClaim for the SQLite database. Ensure that your Kubernetes cluster has a provisioner that can provide persistent storage.
- The service is of type ClusterIP. If you want to expose the application outside the cluster, consider changing the service type to NodePort or LoadBalancer, or set up an Ingress.
- The image in the deployment.yaml is set to `aegiscart:latest`. You should replace this with your actual image repository and tag, or use a CI/CD pipeline to update the image.