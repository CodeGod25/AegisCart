// Feature flag system for AegisCart
//
// Flags are read from environment variables prefixed with FEATURE_
// or can be overridden by a JSON file if needed.
//
// This ensures that feature flags do not affect the deterministic money math
// as they should only be used for non-critical features like UI, experimental endpoints, etc.
//
// To add a new feature flag:
// 1. Add the flag to the FeatureFlags interface
// 2. Add a default value in the featureFlags object below, using the getEnvBool helper
// 3. Optionally, add documentation in this file about what the flag controls
//
// Example usage in code:
//   import featureFlags from '../features/flags';
//   if (featureFlags.enableNewDashboard) {
//     // show new dashboard
//   }

import { env } from "../config/env";

interface FeatureFlags {
  // Example flags
  enableNewDashboard: boolean;
  enableExperimentalEndpoint: boolean;
  enableAgentUIEnhancements: boolean;
  // Add more flags as needed
}

// Helper to get boolean from env
function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

// Load feature flags from environment
// Environment variables take precedence over defaults
export const featureFlags: FeatureFlags = {
  enableNewDashboard: getEnvBool('FEATURE_ENABLE_NEW_DASHBOARD', false),
  enableExperimentalEndpoint: getEnvBool('FEATURE_ENABLE_EXPERIMENTAL_ENDPOINT', false),
  enableAgentUIEnhancements: getEnvBool('FEATURE_ENABLE_AGENT_UI_ENHANCEMENTS', false),
  // Add more flags here
};

// For debugging: export a function to get all feature flags as an object
export const getFeatureFlags = (): Record<string, boolean> => {
  return {
    enableNewDashboard: featureFlags.enableNewDashboard,
    enableExperimentalEndpoint: featureFlags.enableExperimentalEndpoint,
    enableAgentUIEnhancements: featureFlags.enableAgentUIEnhancements,
    // Add more flags here as they are added to the interface
  };
};

export default featureFlags;