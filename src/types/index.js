/**
 * @typedef {'easy' | 'medium' | 'hard'} Difficulty
 */

/**
 * @typedef {Object} Question
 * @property {string} id - UUID generated at creation time
 * @property {string} expression - Human-readable expression, e.g. "12 + 7"
 * @property {number} answer - Authoritative correct answer
 * @property {Difficulty} difficulty - Question difficulty level
 * @property {boolean} isInteger - Whether the answer is an integer (drives exact vs. tolerance validation)
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} correct - Whether the submission is correct
 * @property {number | null} parsed - Parsed numeric value, null if parsing failed
 */

/**
 * @typedef {'waiting' | 'active' | 'countdown' | 'closed'} RoundState
 */

/**
 * @typedef {Object} RoundContext
 * @property {string} roundId - UUID of the round
 * @property {Question} question - The current question
 * @property {RoundState} state - Current round state
 * @property {number} startedAt - Server epoch ms when broadcast fired
 * @property {string | null} winnerId - User ID of the winner
 * @property {string | null} winnerName - Display name of the winner
 * @property {number} sequenceCounter - Incremented atomically per submission receipt
 * @property {NodeJS.Timeout | null} timeoutHandle - Timeout handle for round timeout
 * @property {NodeJS.Timeout | null} countdownHandle - Timeout handle for countdown
 */

/**
 * @typedef {Object} UserSession
 * @property {string} socketId - Socket.io socket ID
 * @property {string} userId - Database user ID
 * @property {string} displayName - User's display name
 * @property {number} score - Wins in current server lifetime
 * @property {number} connectedAt - Timestamp when user connected
 * @property {number | null} disconnectedAt - Timestamp when user disconnected
 * @property {NodeJS.Timeout | null} reconnectTimer - Timer for session expiry
 */

/**
 * @typedef {Object} JWTPayload
 * @property {string} userId - User ID from database
 * @property {string} displayName - User's display name
 * @property {number} iat - Issued at (Unix timestamp)
 * @property {number} exp - Expiration (Unix timestamp)
 */

module.exports = {};
