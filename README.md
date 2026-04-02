# Competitive Math Quiz

A real-time multiplayer math quiz game where players race to be the first to solve arithmetic expressions. Built with Node.js, React, Socket.io, PostgreSQL, and Docker.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
  - [Docker (recommended)](#docker-recommended)
  - [Local Development](#local-development)
- [How the Game Works](#how-the-game-works)
- [Question Generation](#question-generation)
- [Answer Validation](#answer-validation)
- [Session & Reconnection](#session--reconnection)

---

## Overview

Players join with a unique display name, receive a JWT token, and connect via WebSocket to compete in live math rounds. Each round presents an arithmetic expression; the first player to submit the correct answer wins the round and earns a point on the leaderboard. Rounds auto-cycle with a 5-second countdown between them and a 60-second timeout if no one answers correctly.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│   React (Vite) + Socket.io-client                       │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP :80 / WS :80
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Nginx (client container)               │
│   Serves static React build                             │
│   Proxies /api  → server:3000                           │
│   Proxies /socket.io → server:3000 (WebSocket upgrade)  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP :3000
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js / Express + Socket.io              │
│                   (server container)                    │
│                                                         │
│  REST Routes          WebSocket Handler                 │
│  ├─ POST /api/session  ├─ submit_answer                 │
│  ├─ GET  /api/leaderboard ├─ ping_latency               │
│  ├─ GET  /api/rounds/:id/stats └─ disconnect            │
│  └─ GET  /api/health                                    │
│                                                         │
│  Modules                                                │
│  ├─ SessionManager   (in-memory sessions)               │
│  ├─ RoundManager     (round lifecycle + timers)         │
│  ├─ QuestionGenerator (arithmetic expression builder)   │
│  └─ AnswerValidator  (pure validation function)         │
└────────────────────┬────────────────────────────────────┘
                     │ Prisma ORM
                     ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL 16 (db container)               │
│   Tables: User, Round, Submission                       │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Socket.io-client 4 |
| Backend | Node.js 20, Express 5, Socket.io 4 |
| Database | PostgreSQL 16, Prisma 7 ORM |
| Auth | JSON Web Tokens (HS256, 7-day expiry) |
| Containerization | Docker, Docker Compose |
| Web Server | Nginx (Alpine) |

---

## Project Structure

```
.
├── src/                        # Backend source
│   ├── index.js                # Server entry point
│   ├── auth/
│   │   ├── jwtUtils.js         # Token generation & verification
│   │   └── jwtMiddleware.js    # Express & Socket.io JWT middleware
│   ├── modules/
│   │   ├── SessionManager.js   # In-memory session store
│   │   ├── RoundManager.js     # Round lifecycle & state machine
│   │   ├── QuestionGenerator.js # Arithmetic question builder
│   │   └── AnswerValidator.js  # Pure answer validation
│   ├── routes/
│   │   ├── session.js          # POST /api/session
│   │   ├── roundStats.js       # GET /api/rounds/:id/stats
│   │   └── index.js            # Route aggregator
│   ├── socket/
│   │   └── connectionHandler.js # WebSocket event handlers
│   └── types/
│       └── index.js            # JSDoc type definitions
├── client/                     # Frontend source
│   ├── src/
│   │   ├── App.jsx             # Root component, auth state
│   │   ├── components/
│   │   │   ├── JoinScreen.jsx  # Display name entry
│   │   │   ├── GameScreen.jsx  # Main game UI
│   │   │   └── Leaderboard.jsx # Win count rankings
│   │   └── hooks/
│   │       └── useSocket.js    # Socket.io connection hook
│   ├── nginx.conf              # Nginx proxy config
│   └── Dockerfile              # Multi-stage build
├── prisma/
│   ├── schema.prisma           # Data models
│   └── migrations/             # SQL migration history
├── Dockerfile                  # Backend container
├── docker-compose.yml          # Full stack orchestration
└── .env.example                # Environment variable template
```

---

## Database Schema

### User
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| displayName | String | Unique |
| winCount | Int | Default 0 |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Round
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| expression | String | e.g. `42 * 7` |
| answer | Float | Correct answer |
| difficulty | String | `easy` / `medium` / `hard` |
| isInteger | Boolean | Drives validation mode |
| state | String | `active` / `countdown` / `timed_out` |
| startedAt | DateTime | Round start time |
| endedAt | DateTime? | Nullable |
| winnerId | UUID? | FK → User |

### Submission
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| roundId | UUID | FK → Round |
| userId | UUID | FK → User |
| rawInput | String | Exactly what the user typed |
| parsedValue | Float? | Null if non-numeric |
| isCorrect | Boolean | |
| receivedAt | DateTime | Server receipt timestamp |
| sequence | Int | Monotonic counter per round |

---

## API Reference

### `POST /api/session`

Join or re-join the quiz. Issues a JWT on success.

**Request body**
```json
{ "displayName": "Alice" }
```

**Response 200**
```json
{
  "token": "<jwt>",
  "userId": "<uuid>",
  "displayName": "Alice",
  "currentRound": {
    "roundId": "<uuid>",
    "expression": "34 + 58",
    "state": "active",
    "startedAt": 1712000000000
  }
}
```

**Errors**
- `400 INVALID_REQUEST` — missing or invalid displayName (max 50 chars)
- `409 DISPLAY_NAME_TAKEN` — name already in an active session

---

### `GET /api/leaderboard`

Returns the top 10 players by win count.

**Response 200**
```json
{
  "leaderboard": [
    { "rank": 1, "displayName": "Alice", "winCount": 12 },
    { "rank": 2, "displayName": "Bob",   "winCount": 9 }
  ]
}
```

---

### `GET /api/rounds/:id/stats`

Returns latency statistics for a completed round.

**Response 200**
```json
{
  "roundId": "<uuid>",
  "submissionCount": 14,
  "latency": { "minMs": 120, "maxMs": 3400, "avgMs": 890 }
}
```

**Errors**
- `404 ROUND_NOT_FOUND`

---

### `GET /api/health`

Simple health check.

**Response 200**
```json
{ "status": "ok" }
```

---

## WebSocket Events

All WebSocket connections require a valid JWT passed in the handshake auth:

```js
const socket = io({ auth: { token: '<jwt>' } })
```

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `round_started` | `{ roundId, expression, difficulty, startedAt, timeoutSecs }` | New round begins |
| `round_ended` | `{ roundId, winnerName, winnerId, correctAnswer, reason }` | Round over (`winner_found` or `timeout`) |
| `countdown_tick` | `{ secondsRemaining }` | 5-second countdown before next round |
| `submission_ack` | `{ roundId, correct, winner, message }` | Response to your answer submission |
| `leaderboard_updated` | `{ leaderboard }` | Pushed after every round win |
| `user_joined` | `{ displayName, reconnected }` | Another player connected |
| `user_left` | `{ displayName }` | A player disconnected |
| `pong_latency` | `{ clientTs, serverTs }` | Response to ping |
| `high_latency_warning` | `{ rttMs, message }` | RTT > 2000ms warning |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `submit_answer` | `{ roundId, answer }` | Submit an answer for the active round |
| `ping_latency` | `{ clientTs }` | Measure round-trip latency |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/math_quiz?schema=public"

# Secret used to sign JWTs — use a long random string in production
JWT_SECRET="your-secret-here"

# Port the backend listens on
PORT=3000
```

---

## Getting Started

### Docker (recommended)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
# 1. Clone the repo
git clone <repo-url>
cd mathquiz

# 2. Create your .env file
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# 3. Start all services
docker compose up --build

# App is now available at http://localhost
# Backend API at http://localhost:3000
```

The `server` container automatically runs `prisma migrate deploy` on startup before launching the Node.js process.

To stop:
```bash
docker compose down
# To also remove the database volume:
docker compose down -v
```

---

### Local Development

**Prerequisites:** Node.js 20+, PostgreSQL 16 running locally.

**Backend**

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Update DATABASE_URL to point to your local Postgres instance

# Run database migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

# Start backend with hot reload
npm run dev
# Server runs on http://localhost:3000
```

**Frontend**

```bash
cd client

# Install dependencies
npm install

# Start Vite dev server (proxies /api and /socket.io to localhost:3000)
npm run dev
# Client runs on http://localhost:5173
```

---

## How the Game Works

1. Player enters a display name → server upserts a `User` record and issues a JWT
2. Client connects via WebSocket using the JWT
3. Server emits `round_started` with the current expression
4. Players type their answer and submit via `submit_answer`
5. Server validates the answer and uses an atomic DB update (`updateMany WHERE winnerId IS NULL`) to determine the winner with no race conditions
6. Winner's `winCount` is incremented; `round_ended` is broadcast to all players
7. Updated leaderboard is pushed via `leaderboard_updated`
8. A 5-second countdown (`countdown_tick`) plays, then a new round starts automatically
9. If no one answers within 60 seconds, the round times out and a new one begins

---

## Question Generation

Questions are generated server-side at three difficulty levels:

| Difficulty | Operand Range | Operations | Format |
|---|---|---|---|
| easy | 1–20 | `+`, `-` | `a op b` (non-negative result) |
| medium | 1–100 | `+`, `-`, `*`, `/` | `a op b` (integer division only) |
| hard | 1–1000 | all four | `(a op b) op c` or `((a op b) op c) op d` |

Consecutive rounds are guaranteed to have different expressions. Hard questions may produce non-integer answers.

---

## Answer Validation

Validation is a pure, stateless function in `AnswerValidator.js`:

- Input is parsed with `parseFloat`; non-numeric input → `{ correct: false, parsed: null }`
- Integer questions: exact match required (`parsed === answer`)
- Non-integer questions: tolerance of ±0.01 (`Math.abs(parsed - answer) <= 0.01`)

---

## Session & Reconnection

Sessions are stored in-memory (not in the database):

- On connect: session is created or restored if the user ID already has one
- On disconnect: a 30-second grace timer starts
- If the player reconnects within 30 seconds: their session (including score) is restored with the new socket ID
- After 30 seconds: the session is removed and the display name becomes available again
