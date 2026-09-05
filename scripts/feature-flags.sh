#!/bin/bash
set -euo pipefail

# Usage: ./scripts/feature-flags.sh
# Prints the current feature flag values from environment variables

echo "Feature flags (from FEATURE_* environment variables):"
printenv | grep '^FEATURE_' | sort || true

# Also, if we have a JSON file for feature flags, we can print it
# But we don't have one yet.

echo ""
echo "Note: Feature flags are also defined in src/features/flags.ts"
echo "and can be overridden by setting FEATURE_* environment variables."