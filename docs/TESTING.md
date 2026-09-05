# Testing

AegisCart uses Node.js built-in test runner (node:test) for unit and integration tests.

## Test Suite Overview

The test suite covers:
- Policy engine bounds and calculations
- Offer signing and verification
- Mandate creation and validation
- Failure taxonomy and handling
- Revenue optimization algorithms
- Agent service deterministic behavior
- Ledger append-only properties
- Idempotency guarantees
- x402 handshake flow
- End-to-end scenarios

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with Verbose Output
```bash
npm test -- --verbose
```

### Run Specific Test File
```bash
npm test -- test/policyEngine.test.ts
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Test Coverage
```bash
npm run test:coverage
```
This generates a coverage report in the `coverage/` directory.

## Test Structure

Tests are organized in the `test/` directory:
- `test/policyEngine.test.ts` - Policy engine tests
- `test/offerService.test.ts` - Offer signing and verification
- `test/mandateService.test.ts` - Mandate lifecycle tests
- `test/agentService.test.ts` - Conversational agent tests
- `test/ledgerService.test.ts` - Ledger and SSE tests
- `test/checkoutService.test.ts` - Checkout and payment flow
- `test/revenueService.test.ts` - Pricing and bundling
- `test/failureTaxonomy.test.ts` - Failure mode tests
- `test/integration/*.test.ts` - Cross-service integration tests

## Writing Tests

### Test File Naming
Use `.test.ts` suffix for test files.

### Test Organization
Each test file should:
1. Import the module being tested
2. Set up any necessary mocks or fixtures
3. Use `describe()` blocks to group related tests
4. Use `it()` blocks for individual test cases
5. Clean up after tests if needed

### Assertions
Use Node.js built-in assertions from the `assert` module:
```typescript
import { strict as assert } from 'assert';

assert.strictEqual(actual, expected);
assert.deepStrictEqual(actual, expected);
assert.ok(value, 'message');
assert.throws(() => { /* code */ }, Error);
```

### Mocking
For external dependencies:
- Use dependency injection where possible
- Create mock implementations in test files
- Use `vi.mock()` if using Vitest (not currently used)

### Database Testing
Tests use an in-memory SQLite database that is created fresh for each test file. The `initializeDatabase` function accepts a custom path.

Example:
```typescript
import { initializeDatabase } from '../src/db/client';

// In beforeEach
const db = await initializeDatabase(':memory:');

// Use db in tests
```

## Continuous Integration

Tests run automatically on push and pull requests via GitHub Actions (see `.github/workflows/ci-cd.yml`).

The CI workflow:
1. Sets up Node.js
2. Installs dependencies
3. Runs `npm run check` (type checking)
4. Runs `npm test` (test suite)
5. Runs `npm audit` (security scanning)
6. Builds the application
7. Builds and pushes Docker image (on pushes to `main`)

## Best Practices

1. **Isolation**: Each test should be independent and not rely on state from other tests.
2. **Determinism**: Tests should pass consistently given the same inputs.
3. **Speed**: Keep unit tests fast; save slower integration tests for when needed.
4. **Clarity**: Test names should describe what is being tested and the expected outcome.
5. **Coverage**: Aim to test edge cases and error conditions, not just happy paths.
6. **Fixtures**: Reuse test data where possible but avoid over-complex shared state.

## Debugging Tests

### Run a Single Test
```bash
npm test -- --test-name-pattern="should create valid offer"
```

### Debug with Node.js Inspector
```bash
node --inspect-brk ./node_modules/.bin/node-test test/yourFile.test.ts
```

### Enable Verbose Logging
Set `LOG_LEVEL=debug` in your environment when running tests to see detailed logs.

## Test Data

### Test Catalog
The test suite uses a standard test catalog defined in `test/fixtures/catalog.ts` which includes:
- Various SKUs with different prices, categories, and stock levels
- Merchant policy with discount cap, margin floor, etc.

### Environment Variables for Testing
Tests automatically set:
- `NODE_ENV=test`
- `LLM_PROVIDER=mock`
- `AEGIS_SIGNING_SECRET=test-signing-secret`
- `SQLITE_DB_PATH=:memory:` (for isolated in-memory databases)

You can override these in your test environment if needed.

## Flaky Tests

If you encounter a flaky test:
1. Try to identify the source of non-determinism
2. Use mocks to control timing or external dependencies
3. Isolate state properly between tests
4. Consider increasing timeouts for asynchronous operations
5. Report persistent flakiness as an issue

## License

Tests are part of the AegisCart codebase and are licensed under the MIT License.
