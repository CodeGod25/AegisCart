import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { app } from "../app";
import { markAsReady } from "../routes/health";

describe("API Stability - Health Endpoints", () => {
  let server: any;

  before(() => {
    // Mark service as ready for testing
    markAsReady();
    server = app.listen(4001); // Use different port for testing
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  });

  async function get(path: string) {
    const response = await fetch(`http://127.0.0.1:4001${path}`);
    return { response, body: await response.json() as Record<string, any> };
  }

  describe("Liveness Probe", () => {
    it("should return 200 and indicate service is alive", async () => {
      const { response, body } = await get("/health/live");
      assert.equal(response.status, 200);
      assert.equal(body.status, "alive");
      assert.equal(body.service, "aegiscart");
      assert.ok(body.timestamp);
      assert.ok(body.uptime >= 0);
    });
  });

  describe("Readiness Probe", () => {
    it("should return 200 and indicate service is ready", async () => {
      const { response, body } = await get("/health/ready");
      assert.equal(response.status, 200);
      assert.equal(body.status, "ready");
      assert.equal(body.service, "aegiscart");
      assert.ok(body.timestamp);
      assert.ok(body.checks);
      assert.equal(body.checks.database, true);
      assert.equal(body.checks.serviceReady, true);
    });
  });

  describe("Health Endpoint", () => {
    it("should return basic health information", async () => {
      const { response, body } = await get("/health");
      assert.equal(response.status, 200);
      assert.equal(body.status, "ok");
      assert.equal(body.service, "aegiscart");
      assert.ok(body.timestamp);
      assert.ok(body.version);
    });
  });
});