@echo off
echo ========================================
echo Verifying pgloader Docker installation
echo ========================================
echo.

echo Step 1: Checking Docker images...
docker images dimitri/pgloader
echo.

echo Step 2: Testing pgloader version...
docker run --rm dimitri/pgloader:latest pgloader --version
echo.

echo Step 3: Testing pgloader help...
docker run --rm dimitri/pgloader:latest pgloader --help
echo.

echo ========================================
echo Verification complete!
echo ========================================
pause
