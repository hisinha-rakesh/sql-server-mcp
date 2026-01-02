#!/bin/bash
# pgloader Installation Script for Windows (using Docker)
# This script sets up pgloader using the official Docker image

set -e

echo "=== pgloader Installation for Windows ==="
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker is available: $(docker --version)"
echo ""

# Pull the official pgloader Docker image
echo "Pulling pgloader Docker image..."
docker pull dimitri/pgloader:latest

if [ $? -eq 0 ]; then
    echo "✅ pgloader Docker image pulled successfully"
else
    echo "❌ Failed to pull pgloader Docker image"
    exit 1
fi

echo ""
echo "Testing pgloader..."
docker run --rm dimitri/pgloader:latest pgloader --version

echo ""
echo "=== Installation Complete ==="
echo ""
echo "pgloader is now available via Docker!"
echo ""
echo "Usage:"
echo "  docker run --rm dimitri/pgloader:latest pgloader --help"
echo ""
echo "The SQL Server MCP tools will automatically use Docker to run pgloader."
