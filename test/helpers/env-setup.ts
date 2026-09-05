// ---------------------------------------------------------------------------
// Test environment bootstrap.
//
// This module has NO imports on purpose. It MUST be the first import in every
// test file so that these assignments run before `src/config/env` is evaluated
// (config/env parses process.env exactly once, at import time). Under the
// project's CommonJS output, import side-effects run in source order, so a
// leading `import "./helpers/env-setup";` guarantees this.
//
// dotenv.config() (called inside config/env) never overrides variables that are
// already set, so forcing them here also shields the suite from the developer's
// real .env — tests never touch the live database, keys, or a real LLM.
// ---------------------------------------------------------------------------

// A private in-memory SQLite database: perfect isolation, no files, no cleanup.
process.env.SQLITE_DB_PATH = ":memory:";

// Keep the agent on its deterministic floor — no network, no API key required.
process.env.LLM_PROVIDER = "mock";

// A fixed signing secret so HMAC signatures are stable within a run.
process.env.AEGIS_SIGNING_SECRET = "test-signing-secret";

// Force the simulated (local) payment path regardless of any real Razorpay creds
// in the developer's .env. Empty strings are falsy but still "set", so dotenv
// will not override them.
process.env.RAZORPAY_KEY_ID = "";
process.env.RAZORPAY_KEY_SECRET = "";

export {};
