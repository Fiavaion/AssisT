#!/bin/bash
# Restore Full E2E Test Suite
# Run this script to restore all tests from the backup
# Usage: bash tests/e2e/restore-full-suite.sh

echo "Restoring full E2E test suite from backup..."
cp tests/e2e-full-suite-backup/*.js tests/e2e/
echo "Done! Full test suite restored."
echo "Run: npx playwright test tests/e2e/ --reporter=list"
