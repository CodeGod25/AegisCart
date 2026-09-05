#!/bin/bash
set -euo pipefail

# Usage: ./scripts/validate-env.sh [environment]
# Example: ./scripts/validate-env.sh staging
# Validates that the required environment variables are set

ENVIRONMENT=${1:-development}
ENV_FILE=".env.$ENVIRONMENT"

echo "Validating environment for: $ENVIRONMENT"

# Check if the environment file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file $ENV_FILE not found"
  # Fall back to .env
  if [ -f ".env" ]; then
    echo "Using .env instead"
    ENV_FILE=".env"
  else
    echo "No .env file found"
    exit 1
  fi
fi

# Load the environment file to check the variables
# We'll source the file to get the variables, but we don't want to export them necessarily
# Instead, we can grep for VAR= lines and check if they are set in the current environment
# But note: the file might have comments and empty lines.

# We'll extract variable names from the ENV_FILE (lines that look like VAR=something)
VARIABLES=$(grep -E '^[[:space:]]*[A-Z_][A-Z0-9_]*[[:space:]]*=' "$ENV_FILE" | sed -E 's/^[[:space:]]*([A-Z_][A-Z0-9_]*[[:space:]]*)=.*/\1/' | xargs)

echo "Checking for the following variables: $VARIABLES"

MISSING=0
for VAR in $VARIABLES; do
  # Remove any trailing spaces from the variable name
  VAR=$(echo "$VAR" | xargs)
  if [ -z "${!VAR:-}" ]; then
    echo "Error: Variable $VAR is not set"
    MISSING=$((MISSING+1))
  fi
done

if [ $MISSING -ne 0 ]; then
  echo "Validation failed: $MISSING variable(s) missing"
  exit 1
else
  echo "Validation passed: All required variables are set"
fi