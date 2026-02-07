---
sidebar_position: 2
---

# Database Setup

PostgreSQL configuration for Argus.

## Requirements

- PostgreSQL 14 or higher
- Recommended: 1GB+ RAM for the database

## Installation

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### macOS

```bash
brew install postgresql@14
brew services start postgresql@14
```

## Create Database

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE argus;
CREATE USER argus_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE argus TO argus_user;
\q
```

## Connection String

Add to your `.env`:

```bash
DATABASE_URL=postgresql://argus_user:your_password@localhost:5432/argus
```

## Run Migrations

```bash
npm run db:migrate
```

## Seed Data (Optional)

Populate with starter sources:

```bash
npm run db:seed
```

## Schema Overview

### Tables

| Table | Description |
|-------|-------------|
| `sources` | RSS feed configurations |
| `articles` | Ingested articles |
| `briefings` | Generated briefings |
| `source_lists` | User-created source groups |
| `verifications` | Article verification data |

### Key Indexes

```sql
-- Full-text search
CREATE INDEX articles_fts_idx ON articles USING GIN (to_tsvector('english', title || ' ' || content));

-- Time-based queries
CREATE INDEX articles_published_idx ON articles (published_at DESC);

-- Domain filtering
CREATE INDEX articles_domain_idx ON articles (domain);
```

## Maintenance

### Vacuum

Run regularly to reclaim space:

```bash
sudo -u postgres vacuumdb --analyze argus
```

### Monitor Size

```sql
SELECT pg_size_pretty(pg_database_size('argus'));
```

### Prune Old Articles

Keep last 90 days:

```sql
DELETE FROM articles WHERE published_at < NOW() - INTERVAL '90 days';
```

## Backup & Restore

### Backup

```bash
pg_dump argus > argus_backup.sql
```

### Restore

```bash
psql argus < argus_backup.sql
```

## Performance Tuning

For production, edit `postgresql.conf`:

```ini
# Memory
shared_buffers = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB

# Connections
max_connections = 50

# Logging
log_min_duration_statement = 1000  # Log slow queries > 1s
```
