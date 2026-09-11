# Project Titan: XAUUSD Backtester

Institution-grade trading replay, backtesting, and research platform.
Target market: XAUUSD (Gold).

## Prerequisites
- Docker
- Docker Compose

## Deployment Strategy (Production)

1. **Clone the repository**
   ```bash
   git clone https://github.com/HemangGadhvi04/xau_backtester.git
   cd xau_backtester
   ```

2. **Configure Environment**
   Copy the example environment file and secure the variables:
   ```bash
   cp .env.example .env
   # Edit .env and change JWT_SECRET to a secure random string!
   nano .env
   ```

3. **Build and Start the Stack**
   Bring up the production PostgreSQL, Redis, FastAPI backend, Celery worker, and React frontend (Nginx).
   ```bash
   docker compose up -d --build
   ```

4. **Populate Market Data (Critical Step)**
   The docker containers do not ship with the hundreds of megabytes of raw CSV/Parquet tick data to save bandwidth. You must fetch the historical data directly inside the API container. 
   
   To download data (this uses Dukascopy and converts it to highly optimized DuckDB parquets):
   ```bash
   docker compose exec api python download_dukascopy_xau.py
   ```
   *Note: This process may take a few minutes as it downloads, processes, and compresses the tick data into the persistent `market_data` volume.*

5. **Verify Installation**
   Visit `http://localhost` in your browser.

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Lightweight Charts v5
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, Celery, Redis
- **Database**: PostgreSQL
- **Data Engine**: DuckDB / Apache Arrow
