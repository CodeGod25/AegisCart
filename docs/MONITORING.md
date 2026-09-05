# Monitoring and Observability

AegisCart provides built-in endpoints and logs to monitor health, performance, and business metrics.

## Health Endpoints

### Liveness Probe
```http
GET /health
```
Returns `{ status: "ok" }` if the process is running. Use for liveness checks in orchestration systems.

### Readiness Probe
The same `/health` endpoint can be used for readiness if the application considers itself ready immediately after startup. If you need to check dependencies (database, external APIs), implement a custom readiness endpoint.

## Business Metrics

### Get Metrics
```http
GET /metrics
```
Returns key business metrics reconstructed from the append-only ledger, ensuring they match the audit trail.

#### Response Format
```json
{
  "revenue": number,          // Total revenue in currency units (e.g., paise for INR)
  "grossMargin": number,      // Total gross margin
  "discountGiven": number,    // Total discount amount given
  "aov": number,              // Average order value
  "orderCount": number,       // Number of completed orders
  "timestamp": string         // ISO timestamp of when metrics were computed
}
```
All monetary values are in the smallest currency unit (e.g., paise).

## Ledger Stream

### Server-Sent Events
```http
GET /ledger/stream
```
Provides a real-time stream of ledger entries as Server-Sent Events (SSE). Each event is a JSON line with the following structure:
```json
{
  "id": "string",           // Unique event ID
  "timestamp": string,      // ISO timestamp
  "actor": string,          // Service or component that generated the event
  "action": string,         // Action performed (e.g., "offer-created", "payment-success")
  "reasonCode": string,     // Standardized reason code
  "amount": number,         // Monetary amount involved (if applicable)
  "metadata": object        // Additional context
}
```
Use this for audit trails, real-time dashboards, or triggering external workflows.

## Logging

AegisCart logs to stdout/stderr. The log level is controlled by the `LOG_LEVEL` environment variable (`error`, `warn`, `info`, `debug`).

### Log Format
Logs are human-readable and include timestamps, log levels, and messages. Example:
```
[2026-09-03T10:30:00.123Z] info: AgentService: Processing message: "I want to buy 5 mice"
[2026-09-03T10:30:00.456Z] warn: PaymentService: Simulated payment decline for testing
```

### Structured Logging (Future)
Consider migrating to a structured logging library (like pino) for JSON logs that are easier to parse by log aggregation systems.

## External Monitoring Integration

### Prometheus
To expose metrics in Prometheus format, you can:
1. Use a middleware that converts the `/metrics` endpoint to Prometheus exposition format, or
2. Deploy a sidecar that scrapes `/metrics` and exposes them on a different port.

Example using the `prom-client` library (would require code changes):
```javascript
// In app.ts or middleware
import client from 'prom-client';
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

### ELK Stack
Forward stdout/stderr to Logstash or Filebeat for ingestion into Elasticsearch.

### Datadog, New Relic, etc.
Use their respective Node.js APM agents or log forwarders.

## Alerting Recommendations

Set up alerts for the following conditions:

1. **Health Check Failures**: `/health` returns non-200 or `{ status: !"ok" }`.
2. **Error Rate Spike**: Increase in `error` level logs or specific error reason codes (e.g., `PAYMENT_DECLINED`).
3. **Latency Increase**: Monitor response times for key endpoints (`/negotiate/quote`, `/checkout/pay`).
4. **Ledger Gaps**: No events in `/ledger/stream` for an unexpected period.
5. **Resource Utilization**: High CPU, memory, or disk usage on the host.
6. **External Dependency Failures**: Razorpay API or LLM provider unavailability.

## Debugging

### Enable Verbose Logging
Set `LOG_LEVEL=debug` in your environment to see detailed trace logs.

### Simulate Failures
Use the `/simulate/*` endpoints to inject failures and observe system behavior (development only).

### Inspect Ledger
Query `/ledger/events` with pagination to inspect historical actions.

## Performance Monitoring

### Response Times
Monitor the 95th percentile response time for critical endpoints:
- `/negotiate/quote` (should be < 2s)
- `/checkout/pay` (should be < 3s including external API calls)
- `/agent/message` (should be < 2s)

### Throughput
Track requests per second (RPS) for:
- Incoming agent messages
- Offer creations
- Payment completions

### Cache Hit Ratio
If using external caching (Redis, etc.), monitor hit ratios. The built-in cache service logs hit/miss ratios when `LOG_LEVEL=debug`.

## Log Retention

In production, ensure logs are retained for sufficient time to meet audit requirements (typically 6-12 months for financial applications). Use log rotation and archiving strategies provided by your logging infrastructure.
