# Troubleshooting

This guide helps you diagnose and resolve common issues with AegisCart.

## Installation Issues

### "Command not found: rtk"
RTK (Rust Token Killer) is not installed or not in your PATH.

**Solution**:
1. Install RTK: `cargo install rtk`
2. Verify installation: `rtk --version`
3. Ensure the installation directory is in your PATH
4. If you have a naming conflict with reachingforthejack/rtk (Rust Type Kit), uninstall it and install the correct RTK

### "Cannot find module 'typescript'"
TypeScript is not installed.

**Solution**:
```bash
npm install -D typescript
```

### "Error: SQLITE_CANTOPEN: unable to open database file"
The application cannot access the SQLite database file.

**Solutions**:
1. Check that the directory specified in `SQLITE_DB_PATH` exists and is writable
2. Verify the path in your `.env` file
3. Ensure sufficient disk space
4. Check file permissions

## Runtime Issues

### Application fails to start
The application exits immediately after starting.

**Diagnosis**:
1. Check the console output for error messages
2. Look at the logs in `backend.log` and `frontend.log`
3. Run with `npm run dev` to see detailed startup errors

**Common Causes**:
1. **Missing environment variables**: Required variables like `AEGIS_SIGNING_SECRET` are not set
   - Solution: Copy `.env.example` to `.env` and fill in required values
2. **Port already in use**: Another process is listening on the configured port
   - Solution: Change the `PORT` in `.env` or stop the conflicting process
3. **Database corruption**: The SQLite database file is corrupted
   - Solution: Restore from backup or delete the database file (it will be recreated on startup)
4. **Dependency issues**: Node modules are missing or incompatible
   - Solution: Run `npm install` again

### "Address already in use" error
When trying to start the server, you get an EADDRINUSE error.

**Solutions**:
1. Find and stop the process using the port:
   ```bash
   # Find the process
   netstat -ano | findstr :<PORT>
   
   # Stop it (Windows)
   taskkill /PID <PID> /F
   
   # Stop it (Unix/macOS)
   kill <PID>
   ```
2. Change the port in your `.env` file
3. Wait for the socket to timeout (usually 1-2 minutes)

### Application starts but doesn't respond
The server appears to be running but doesn't respond to requests.

**Diagnosis**:
1. Check if the server is listening on the expected port and interface
2. Verify firewall settings aren't blocking connections
3. Check if there's a reverse proxy misconfiguration
4. Look for infinite loops or deadlocks in the logs

**Solutions**:
1. Verify the server is binding to `0.0.0.0` (all interfaces) not just `localhost`
2. Check firewall rules
3. Test locally with `curl http://localhost:<PORT>/health`
4. Restart the application

## Database Issues

### "Database is locked" errors
SQLite reports that the database is locked.

**Causes and Solutions**:
1. **Too many concurrent writes**: SQLite has limited concurrent write capacity
   - Solution: Reduce concurrent traffic or consider migrating to a client/server database for high-concurrency scenarios
2. **Long-running transactions**: A transaction is holding the lock for too long
   - Solution: Check for long-running database operations in the code
3. **Multiple processes**: Multiple instances trying to write to the same database file
   - Solution: Ensure only one instance accesses the database, or use a proper database server

### Database file grows unexpectedly large
The SQLite database file is using more disk space than expected.

**Solutions**:
1. Enable auto-vacuum: The application already uses PRAGMA auto_vacuum
2. Check for excessive logging or metadata accumulation
3. Consider periodic database maintenance:
   ```bash
   sqlite3 data/aegiscart.db "VACUUM;"
   ```

## Specific Feature Issues

### Agent conversation not working
The conversational agent (`/agent/message`) is not responding correctly.

**Diagnosis**:
1. Check if LLM provider is configured correctly
2. Verify the agent service logs
3. Test with the mock LLM provider first
4. Check the failure taxonomy endpoint

**Solutions**:
1. Set `LLM_PROVIDER=mock` to verify basic functionality
2. Check `LLM_API_KEY` and `LLM_MODEL` if using a real provider
3. Verify network connectivity to the LLM API endpoint
4. Check rate limits on the LLM provider

L

### Payment processing issues
Payments are failing or not being processed correctly.

**Diagnosis**:
1. Check Razorpay configuration
2. Verify webhook signatures if using webhooks
3. Look at payment service logs
4. Test with simulated payments (no Razorpay keys)

**Solutions**:
1. For simulated payments: Remove or leave empty `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
2. For real payments:
   - Verify Razorpay test mode keys are correct
   - Check that the webhook secret matches
   - Ensure the application can reach `api.razorpay.com`
   - Verify the amount is within minimum/maximum limits for Razorpay
3. Check idempotency keys if seeing duplicate charges

### Mandate operations failing
Creating, inspecting, or revoking mandates is not working.

**Diagnosis**:
1. Check mandate service logs
2. Verify the signing secret is consistent
3. Check that all required fields are present in requests
4. Verify signature validation logic

**Solutions**:
1. Ensure `AEGIS_SIGNING_SECRET` is set and consistent across restarts
2. Verify request payloads match the expected schema
3. Check timestamp formats (should be ISO 8601)
4. Verify that recurrence fields are correctly formatted

### Rate limiting blocking legitimate requests
Legitimate requests are being rate limited.

**Diagnosis**:
1. Check rate limiter configuration
2. Verify `X-Forwarded-For` headers if behind a proxy
3. Check if distributed rate limiting is needed for multiple instances

**Solutions**:
1. Adjust `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` in `.env`
2. Set `TRUST_PROXY=true` if behind a load balancer or reverse proxy
3. Consider implementing a distributed rate limiter (Redis-based) for multi-instance deployments
4. Whitelist internal IPs or health check endpoints if needed

## Performance Issues

### High response times
The application is responding slowly to requests.

**Diagnosis**:
1. Check CPU and memory usage
2. Look at database query performance
3. Check for external API call latency (Razorpay, LLM providers)
4. Review cache hit ratios

**Solutions**:
1. Profile the application to identify bottlenecks
2. Add database indexes if needed (though SQLite indices are automatic for primary keys)
3. Optimize external API calls (consider caching or async processing)
4. Enable and tune caching:
   - Check `CACHE_TTL_SECONDS` in `.env`
   - Monitor cache hit/miss ratios in logs when `LOG_LEVEL=debug`
5. Consider using a CDN for static assets (though currently served directly from Node.js)

### Memory usage increasing over time
Memory consumption grows during application runtime.

**Diagnosis**:
1. Check for memory leaks in caches or event listeners
2. Look at Node.js memory usage with `--inspect`
3. Check if ledger data is accumulating without cleanup

**Solutions**:
1. Review cache implementations for proper eviction policies
2. Ensure event listeners are properly cleaned up
3. Consider implementing ledger pruning or archiving for old data
4. Use Node.js built-in profiling tools:
   ```bash
   node --inspect server.js
   ```
5. Check for global variables that accumulate data

## Deployment Issues

### Docker container fails to start
The Docker container exits immediately after starting.

**Diagnosis**:
1. Check Docker logs: `docker logs <container-id>`
2. Verify the image was built correctly
3. Check environment file mounting

**Solutions**:
1. Ensure the `.env` file is correctly mounted: `--env-file .env`
2. Verify the database directory is mounted if using persistence: `-v ./data:/app/data`
3. Check that the entrypoint script is executable
4. Verify Node.js version compatibility

### Kubernetes CrashLoopBackOff
Pods are repeatedly crashing and restarting.

**Diagnosis**:
1. Check pod logs: `kubectl logs <pod-name>`
2. Describe the pod: `kubectl describe pod <pod-name>`
3. Check events: `kubectl get events`

**Solutions**:
1. Verify secrets are correctly mounted
2. Check configmap values
3. Ensure persistent volume claims are bound correctly
4. Verify resource limits aren't too low
5. Check application logs for startup errors

### Service unavailable after deployment
The service is not responding after a successful deployment.

**Diagnosis**:
1. Check if the service is listening on the correct port
2. Verify network policies and service definitions
3. Check liveness/readiness probes
4. Look at ingress/controller configuration

**Solutions**:
1. Verify the service port matches the container port
2. Check that the deployment selector matches the pod labels
3. Verify ingress rules and host configuration
4. Check liveness/readiness probe paths and ports
5. Ensure the container image is correctly tagged and pulled

## Monitoring and Debugging

### Enable verbose logging
Set `LOG_LEVEL=debug` in your environment to see detailed trace logs.

### Access internal state
While not recommended for production, you can:
1. Check the ledger stream: `GET /ledger/stream`
2. Query ledger events: `GET /ledger/events`
3. Check metrics: `GET /metrics`
4. Health check: `GET /health`

### Use built-in simulation endpoints
For testing failure scenarios (development only):
- `POST /simulate/failure` - Inject specific failure modes
- `POST /simulate/llm` - Simulate LLM provider issues
- `GET /simulate/state` - Check current simulation state
- `POST /simulate/reset` - Clear all simulations

### Debugging with Node.js Inspector
```bash
# Add to your start script in package.json
"debug": "node --inspect-brk server.js"

# Then run:
npm run debug
```
And connect with Chrome DevTools or VS Code.

## Getting Help

If you've exhausted this troubleshooting guide:

1. **Check the logs**: Most issues will show clear error messages in the logs
2. **Search existing issues**: Look through the issue tracker for similar problems
3. **Create a minimal reproduction**: Strip down your configuration to the essentials
4. **Open an issue**: Include:
   - Detailed steps to reproduce
   - Expected vs. actual behavior
   - Logs and error messages
   - Environment details (Node.js version, OS, Docker/Kubernetes info)
   - Relevant configuration (with secrets redacted)

Remember to never share your `AEGIS_SIGNING_SECRET`, `LLM_API_KEY`, or Razorpay keys in public forums or issue trackers.
