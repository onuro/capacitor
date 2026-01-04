#!/bin/bash
set -e

echo "Installing dependencies..."
npm ci

echo "Building Next.js app..."
npm run build

echo "Copying static assets to standalone output..."
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "Deployment complete!"
