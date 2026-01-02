#!/bin/bash
# pgloader Docker Wrapper
# Makes it easy to run pgloader commands via Docker on Windows

PGLOADER_IMAGE="dimitri/pgloader:latest"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop."
    exit 1
fi

# If a configuration file is provided, mount it
if [ -f "$1" ]; then
    CONFIG_FILE=$(realpath "$1")
    CONFIG_DIR=$(dirname "$CONFIG_FILE")
    CONFIG_NAME=$(basename "$CONFIG_FILE")

    echo "Running pgloader with config: $CONFIG_FILE"
    docker run --rm \
        --network host \
        -v "$CONFIG_DIR:/data" \
        "$PGLOADER_IMAGE" \
        pgloader "/data/$CONFIG_NAME"
else
    # Pass arguments directly to pgloader
    docker run --rm \
        --network host \
        "$PGLOADER_IMAGE" \
        pgloader "$@"
fi
