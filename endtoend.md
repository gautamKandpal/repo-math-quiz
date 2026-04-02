# End-to-End Architecture — Competitive Math Quiz

## Overview

This is a real-time competitive math quiz where multiple players race to answer math expressions first. There is **no traditional login screen with a password**. Instead, a player picks a display name, the server issues a JWT, and that token gates all subsequent access — both REST and WebSocket.

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React/Vite)                      │
│                                                                 │
│  ┌──────────────┐        ┌──────────────────────────────────┐  │
│  │  JoinScreen  │        │          GameScreen               │  │
│  │              │        │                                  │  │
│  │ Enter name   │        │  Question display                │  │
│  │ POST /session│        │  Answer input                    │  │
│  │ Store JWT    │        │  Leaderboard                     │  │
│  └──────┬───────┘        │  Latency indicator               │  │
│         │ onJoin(auth)   └──────────────┬───────────────────┘  │
│         └────────────────────────────── │                       │
│                                         │ useSocket(token)      │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                    ┌─────────────────────▼──────────────────────┐
                    │           Node.js / Express Server          │
                    │                                            │
                    │  REST API          WebSocket (Socket.io)   │
                    │  ─────────         ──────────────────────  │
                    │  POST /session     io.use(authenticateJWT) │
                    │  GET /leaderboard  connectionHandler        │
                    │  GET /round-stats                          │
                    │  GET /health                               │
                    │                                            │
                    │  ┌────────────┐  ┌──────────────────────┐ │
                    │  │SessionMgr  │  │    RoundManager       │ │
                    │  │(in-memory) │  │  (round lifecycle)    │ │
                    │  └────────────┘  └──────────────────────┘ │
                    │                                            │
                    └──────────────────┬─────────────────────────┘
                                       │
                    ┌──────────────────▼─────────────────────────┐
                    │         PostgreSQL (via Prisma)             │
                    │                                            │
                    │  User  ──< Submission >── Round            │
                    └────────────────────────────────────────────┘
```

---

## Authentication Flow

There is no password. Authentication is purely display-name based — the server issues a JWT that expires in 7 days.

```
Client                              Server                        DB
  │                                    │                           │
  │  1. User types display name        │                           │
  │  POST /api/session                 │                           │
  │  { displayName: "Alice" }          │                           │
  │ ─────────────────────────────────► │                           │
  │                                    │  2. Validate name         │
  │                                    │     (non-empty, ≤50 chars)│
  │                                    │                           │
  │                                    │  3. Check active sessions │
  │                                    │     (in-memory uniqueness)│
  │                                    │                           │
  │                                    │  4. Upsert User record    │
  │                                    │ ─────────────────────────►│
  │                                    │ ◄─────────────────────────│
  │                                    │     { id, displayName }   │
  │                                    │                           │
  │                                    │  5. generateToken(userId, │
  │                                    │     displayName) → JWT    │
  │                                    │     (HS256, 7d expiry)    │
  │                                    │                           │
  │  6. Response 200                   │                           │
  │  { token, userId, displayName,     │                           │
  │    currentRound }                  │                           │
  │ ◄─────────────────────────────────  │                           │
  │                                    │                           │
  │  7. Store in localStorage          │                           │
  │     token, userId, displayName     │                           │
  │                                    │                           │
  │  8. Connect WebSocket              │                           │
  │     io({ auth: { token } })        │                           │
  │ ─────────────────────────────────► │                           │
  │                                    │  9. authenticateSocketJWT │
  │                                    │     verifyToken(token)    │
  │                                    │     → socket.data.user    │
  │                                    │                           │
  │  10. Connection established        │                           │
  │ ◄─────────────────────────────────  │                           │
```

### Name Conflict (409)

If the display name is already held by an active session, the server returns `409 DISPLAY_NAME_TAKEN`. The client shows "That display name is already taken."

### Returning User

If a user with the same display name reconnects (e.g., refreshed the page), the `upsert` finds the existing DB record and issues a fresh JWT. The WebSocket connection handler detects the existing session via `userId` and calls `updateSocketId` to restore it rather than creating a new one.

---

## Session Persistence (localStorage)

```
App.jsx startup
  │
  ├── localStorage has token?
  │     YES → skip JoinScreen, go straight to GameScreen
  │     NO  → show JoinScreen
```

The token is stored in `localStorage` so the user doesn't have to re-enter their name on page refresh. The JWT is valid for 7 days.

---

## Game Flow (After Authentication)

```
Server                                    All Clients
  │                                           │
  │  startRound()                             │
  │  ─ generate question                      │
  │  ─ persist Round to DB                    │
  │  emit('round_started', {                  │
  │    roundId, expression,                   │
  │    difficulty, startedAt,                 │
  │    timeoutSecs: 60 })                     │
  │ ─────────────────────────────────────────►│
  │                                           │  UI: show expression
  │                                           │  60s timer starts
  │                                           │
  │          Player submits answer            │
  │ ◄─────────────────────────────────────────│
  │  emit('submit_answer', { roundId, answer})│
  │                                           │
  │  ─ validate answer                        │
  │  ─ if correct: atomic DB update           │
  │    (updateMany WHERE winnerId IS NULL)     │
  │  ─ persist Submission record              │
  │                                           │
  │  emit('submission_ack') → submitter only  │
  │ ─────────────────────────────────────────►│ (submitter)
  │                                           │
  │  if winner found:                         │
  │  emit('round_ended', {                    │
  │    winnerName, correctAnswer,             │
  │    reason: 'winner_found' })              │
  │ ─────────────────────────────────────────►│ (all)
  │                                           │
  │  emit('leaderboard_updated')              │
  │ ─────────────────────────────────────────►│ (all)
  │                                           │
  │  startCountdown() — 5 ticks               │
  │  emit('countdown_tick', {secondsRemaining})│
  │ ─────────────────────────────────────────►│ (all)
  │                                           │
  │  startRound() again ──────────────────────┘ (loop)
```

If no one answers in 60 seconds, `handleTimeout()` fires, broadcasts `round_ended` with `reason: 'timeout'`, then the same countdown → new round loop begins.

---

## Round State Machine

```
         startRound()
              │
              ▼
          [ active ]  ──── 60s timeout ────► handleTimeout()
              │                                     │
              │ correct answer                       │
              ▼                                     ▼
         [ countdown ] ◄──────────────────── [ countdown ]
              │
              │ 5s
              ▼
          [ active ]  (new round)
```

States stored in DB: `active`, `countdown`, `timed_out`

---

## WebSocket Events Reference

| Direction       | Event                  | Payload                                              |
|-----------------|------------------------|------------------------------------------------------|
| server → client | `round_started`        | roundId, expression, difficulty, startedAt, timeoutSecs |
| server → client | `round_ended`          | roundId, winnerName, winnerId, correctAnswer, reason, latencyStats |
| server → client | `countdown_tick`       | secondsRemaining                                     |
| server → client | `submission_ack`       | roundId, correct, winner, message                    |
| server → client | `leaderboard_updated`  | leaderboard[]                                        |
| server → client | `user_joined`          | displayName, reconnected                             |
| server → client | `user_left`            | displayName                                          |
| server → client | `pong_latency`         | clientTs, serverTs                                   |
| server → client | `high_latency_warning` | rttMs, message                                       |
| client → server | `submit_answer`        | roundId, answer                                      |
| client → server | `ping_latency`         | clientTs                                             |

---

## REST API Reference

| Method | Path                | Auth     | Description                              |
|--------|---------------------|----------|------------------------------------------|
| POST   | `/api/session`      | None     | Create/restore session, get JWT          |
| GET    | `/api/leaderboard`  | JWT      | Top 10 players by win count              |
| GET    | `/api/round-stats`  | JWT      | Stats for a specific round               |
| GET    | `/api/health`       | None     | Server health check                      |

---

## Database Schema

```
User
  id          UUID (PK)
  displayName String (unique)
  winCount    Int
  createdAt   DateTime
  updatedAt   DateTime

Round
  id          UUID (PK)
  expression  String
  answer      Float
  difficulty  String
  isInteger   Boolean
  state       String  (active | countdown | timed_out)
  startedAt   DateTime
  endedAt     DateTime?
  winnerId    UUID? → User

Submission
  id          UUID (PK)
  roundId     UUID → Round
  userId      UUID → User
  rawInput    String
  parsedValue Float?
  isCorrect   Boolean
  receivedAt  DateTime
  sequence    Int
```

---

## Reconnection Handling

1. User disconnects (network drop, tab close, etc.)
2. Server calls `markDisconnected(socketId)` — starts a 30-second expiry timer
3. `user_left` is broadcast to remaining players
4. If user reconnects within 30 seconds:
   - JWT in localStorage is still valid
   - `POST /api/session` issues a new JWT (same userId via upsert)
   - WebSocket connects with new token
   - `updateSocketId` restores the existing session
   - Server emits current `round_started` state to the reconnected socket
5. If 30 seconds pass without reconnect, session is removed and the display name is freed

---

## Latency Measurement

The client sends `ping_latency` with a `clientTs` timestamp every few seconds. The server echoes back `pong_latency` with both `clientTs` and `serverTs`. The client calculates RTT as `Date.now() - clientTs`. If RTT > 2000ms, the server also emits `high_latency_warning`.

---

## Security Notes

- JWT signed with `HS256` using `JWT_SECRET` from environment
- All WebSocket connections require a valid JWT via `authenticateSocketJWT` middleware
- Protected REST routes use `authenticateJWT` middleware (Bearer token)
- Display name uniqueness is enforced at both the in-memory session level and the DB level
- No passwords are stored — the display name is the sole identity mechanism
