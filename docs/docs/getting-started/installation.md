---
sidebar_position: 1
---

# Installation

Get Argus running locally in minutes.

## Prerequisites

- **Node.js** 18+ 
- **PostgreSQL** 14+
- **npm** or **pnpm**

## Clone & Install

```bash
# Clone the repository
git clone https://github.com/VitalPointAI/argus.git
cd argus

# Install dependencies
npm install
```

## Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE argus;
```

Run migrations:

```bash
npm run db:migrate
```

Seed initial sources (optional):

```bash
npm run db:seed
```

## Start Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## Production Build

```bash
# Build all packages
npm run build

# Start production server
npm run start
```

## Docker (Coming Soon)

```bash
docker-compose up -d
```
