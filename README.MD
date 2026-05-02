# Live Location Tracker

Real-time location tracking system built with **Kafka**, **Socket.IO**, **Drizzle ORM**, **PostgreSQL**, and **JWT Authentication**.

---

A full-stack real-time application where authenticated users can:

- **Register/Login** with email and password (JWT-based auth)
- **Share live location** via browser geolocation API
- **See other users** moving on an interactive Leaflet map

## System Architecture

```
┌─────────────────┐         ┌─────────────────┐
│    Browser 1    │◄───────►│                 │
│  (Leaflet Map)  │         │   Socket.IO     │
└─────────────────┘         │    Server       │
                            │   (Port 8000)   │
┌─────────────────┐         │                 │
│    Browser 2    │◄───────►│  ┌───────────┐  │
│  (Leaflet Map)  │         │  │  Producer │  │
└─────────────────┘         └──┴─────┬─────┴──┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │    Kafka     │
                              │  (KRaft)     │
                              │  Port 9092   │
                              └──────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
            │Socket Server │ │   Database  │  │Socket Server│
            │Consumer Grp A│ │  Processor  │  │Consumer Gr A│
            │ (Broadcast)  │ │  (Persist)  │  │ (Broadcast) │
            └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                   │                │                │
                   ▼                ▼                ▼
            Broadcast to     Save to NeonDB     Broadcast to
            all clients     (location_history)   all clients
```

### Consumer Groups

| Consumer Group | Purpose | Scaling |
|---------------|---------|---------|
| `socket-server-8000` | Broadcast location updates via Socket.IO | Multiple instances share load |
| `database-processor` | Persist location history to PostgreSQL | Independent from socket consumers |

> Both consumer groups receive **the same messages** because they belong to different groups. This is the core Kafka pattern for parallel processing.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Vanilla JS, Leaflet.js | Interactive map, real-time markers |
| **Backend** | Node.js, Express | HTTP API, static file serving |
| **Real-time** | Socket.IO | Bi-directional WebSocket communication |
| **Message Broker** | Apache Kafka (KRaft mode) | Event streaming, decoupling |
| **Database** | PostgreSQL (NeonDB) | User data, location history |
| **ORM** | Drizzle ORM | Type-safe SQL queries |
| **Auth** | JWT (Access + Refresh) | Stateless authentication |
| **Container** | Docker Compose | Kafka local development |

---

## Prerequisites

- **Node.js** 18+ (`node --version`)
- **Docker** & **Docker Compose** (`docker --version`)
- **PostgreSQL Database** ([NeonDB](https://neon.tech))
- **Git** for cloning

---

## Setup Instructions

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd live-location-tracker
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values (see [Environment Variables](#environment-variables)).

### 3. Setup Database

**Option A: NeonDB (Recommended - Cloud)**
1. Go to [neon.tech](https://neon.tech) → Sign up → Create project
2. Copy the connection string
3. Paste in `.env` as `DATABASE_URL`

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL locally, then:
createdb location_tracker
# Use: DATABASE_URL=postgresql://user:pass@localhost:5432/location_tracker
```

### 4. Push Schema to Database

```bash
npx drizzle-kit push
```

This creates all tables (`users`, `location_history`, `active_sessions`) and indexes.

### 5. Start Kafka

```bash
docker-compose up -d
```

Verify:
```bash
docker ps
# Should show kafka container running on port 9092
```

### 6. Create Kafka Topic (first time only)

```bash
npm run kafka:setup
```

### 7. Start Application

You need **two terminals**:

**Terminal 1 - Database Processor:**
```bash
npm run db:processor
```

**Terminal 2 - Main Server:**
```bash
npm run dev
```

### 8. Open Application

Navigate to: `http://localhost:8000`

---

## Environment Variables

Create `.env` in project root:

```bash
# Server
PORT=8000
NODE_ENV=development

# Database (NeonDB example)
DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

# JWT Secrets (generate strong random strings, min 32 chars)
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars-long
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=live-location-tracker
KAFKA_TOPIC=location-updates

# Frontend
CLIENT_URL=http://localhost:8000
```

## Authentication Flow

```
┌─────────┐    Register/Login      ┌─────────┐
│ Client  │ ─────────────────────► │ Server  │
│         │                        │         │
│         │ ◄── Access + Refresh ──│         │
│         │    Tokens (JWT)        │         │
└────┬────┘                        └─────────┘
     │
     │ Store tokens in localStorage
     │
     │ Subsequent requests:
     │ Authorization: Bearer <access_token>
     │
     │ Socket.IO handshake:
     │ auth: { token: <access_token> }
     │
     ▼
┌─────────────┐
│ Token Expired?│
└──────┬──────┘
       │
   YES │ Call /api/auth/refresh
       │ with refresh_token
       │
       ▼
┌─────────────┐
│ New tokens  │
│ issued      │
└─────────────┘
```


---

### Testing with Two Users

1. Open `http://localhost:8000` in Chrome
2. Register
3. Open `http://localhost:8000` in Another browser or profile
4. Register 
5. Allow location permission in both
6. See both markers moving on each other's maps!

---

## Demo Video


---
## 🐛 Troubleshooting
### Kafka Connection Failed
```
Connection error: connect ECONNREFUSED localhost:9092
```
**Fix:** Run `docker-compose up -d` and wait 10 seconds for Kafka to start.