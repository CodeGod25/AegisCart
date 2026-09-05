# Feature Flags

AegisCart includes a simple feature flag system to enable gradual rollout of non-critical features, A/B testing, or temporary toggles for experimental functionality.

## How It Works

Feature flags are defined in `src/features/flags.ts` as a TypeScript object. Each flag corresponds to an environment variable prefixed with `FEATURE_`.

The `getFeatureFlags()` function reads the environment and returns a boolean map of flag names to their enabled/disabled state.

## Defining a Flag

1. Add the flag to `src/features/flags.ts`:
   ```typescript
   export const FEATURE_FLAGS = {
     // existing flags...
     NEW_DASHBOARD: false, // default value
     EXPERIMENTAL_API_ENDPOINT: false,
     // ...
   } as const;
   ```

2. The flag will be overridden if an environment variable `FEATURE_NEW_DASHBOARD` is set to `"true"` (case-insensitive) or `"false"`.

3. Use the flag in your code:
   ```typescript
   import { getFeatureFlags } from './features/flags';

   const flags = getFeatureFlags();
   if (flags.NEW_DASHBOARD) {
     // show new dashboard
   }
   ```

## Convention

- **Prefix**: All feature flag environment variables must start with `FEATURE_`.
- **Naming**: Use uppercase with underscores (SNAKE_CASE).
- **Scope**: Feature flags must NOT affect:
  - Deterministic money math
  - Security-related functionality (signature verification, mandate validation)
  - Core ledger integrity
  - Failure handling logic
- **Appropriate Use**: UI enhancements, experimental endpoints, non-critical algorithm toggles, A/B test variants.

## Example Flags

| Flag Environment Variable | Description | Default |
|---------------------------|-------------|---------|
| `FEATURE_ENABLE_NEW_DASHBOARD` | Enables the new revenue dashboard UI | `false` |
| `FEATURE_EXPERIMENTAL_API_V2` | Exposes experimental API endpoints under `/api/v2/` | `false` |
| `FEATURE_ALLOW_NEGATIVE_BUDGET` | (Example of INAPPROPRIATE use) Allows mandates with negative budgets - **DO NOT USE** | `false` |

## Best Practices

1. **Temporary**: Feature flags should be temporary. Remove them once a feature is fully rolled out or deprecated.
2. **Document**: Keep this file updated with the purpose and owner of each flag.
3. **Monitor**: Track usage of feature flags via logging or metrics.
4. **Default Safe**: The default value (in code) should be the safe or legacy behavior.
5. **Avoid Complex Dependencies**: Don't make feature flags depend on other feature flags in complex ways.

## Current Flags

Run `npm run feature-flags` to see the current state of all feature flags based on your environment.

### Script Output Example
```
FEATURE_ENABLE_NEW_DASHBOARD=false
FEATURE_EXPERIMENTAL_API_V2=false
```

## Adding a Flag to the Script

The `scripts/feature-flags.sh` script automatically reads from `src/features/flags.ts`. No additional steps are needed.

## Removing a Flag

1. Remove the flag from `src/features/flags.ts`.
2. Remove any conditional code that used the flag.
3. Remove the environment variable from your deployment configurations.
4. Update this documentation.

## Warning

Never use feature flags to bypass security controls or to weaken deterministic money guarantees. Such use violates the core trust model of AegisCart and is strictly prohibited.
