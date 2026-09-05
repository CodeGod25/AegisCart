#!/bin/bash

echo "AegisCart Quickstart: Push to GitHub and get deployment instructions"
echo "===================================================================="

echo ""
echo "Step 1: Pushing to GitHub"
echo "-------------------------"
./scripts/push_to_github.sh

echo ""
echo "Step 2: Deployment instructions"
echo "-------------------------------"
./scripts/deploy.sh

echo ""
echo "Done!"