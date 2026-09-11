# XAUUSD Backtesting Platform - Quick Setup Guide

Welcome to the XAUUSD Systematic Replay and Backtesting Platform. This guide helps you get the platform up and running locally on your laptop with one command.

## Prerequisites

Make sure you have **Docker Desktop** installed and running on your machine:
👉 [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## Setup & Launch Instructions (Mac / Linux / WSL)

1. **Extract the ZIP file** to a folder on your computer.
2. **Open Terminal** and navigate (`cd`) to the extracted project folder:
   ```bash
   cd /path/to/extracted/xau_backtester
   ```
3. **Run the setup script**:
   ```bash
   ./scripts/setup_local.sh
   ```
   *This script automatically copies `.env.example` to `.env`, generates a secure local JWT secret, builds the containers, and launches the services.*

4. **Access the Dashboard**:
   Once the setup completes, open your web browser and go to:
   👉 **[http://localhost](http://localhost)**

---

## Setup Instructions (Windows Command Prompt / PowerShell)

If you are running raw Windows (without WSL):
1. **Copy the Environment File**:
   Copy `.env.example` and name the copy `.env`. Open it and change `JWT_SECRET` to any secure random string.
2. **Run Docker Compose**:
   ```cmd
   docker compose up --build -d
   ```
3. **Access the Dashboard**:
   👉 **[http://localhost](http://localhost)**

---

## How to Stop or Restart the Platform

- **To Stop the platform** (saving database data):
  ```bash
  docker compose down
  ```
- **To Start it again** (after the initial setup):
  ```bash
  docker compose up -d
  ```
- **To Reset the database** (deleting all local accounts, trades, and drawings):
  ```bash
  docker compose down -v
  ```

---

## Common Troubleshooting

### 1. Port 80 is already in use
If you receive an error that port 80 is occupied (e.g. by another web server):
1. Open the `docker-compose.yml` file.
2. Locate the `web` service's ports mapping.
3. Change `"80:80"` to another port, e.g. `"8080:80"`.
4. Run `docker compose up -d` again and access the site at `http://localhost:8080`.

### 2. No Candle Data on Chart
By default, the platform runs with safe synthetic sample data for Gold, Euro, and Bitcoin. 
If you want to pull fresh real historical tick data from Dukascopy, run the following command in your terminal while the containers are active:
```bash
docker compose exec api python download_dukascopy_xau.py
```
This will automatically stream real historical candles into the data volume.
