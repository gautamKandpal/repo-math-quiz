/**
 * SessionManager Module
 * 
 * Manages in-memory user sessions with reconnection support.
 * Uses factory function pattern with closure for state encapsulation.
 * 
 * Requirements: 7.1, 7.2, 7.5, 9.1, 9.2, 9.3
 */

/**
 * @typedef {import('../types/index.js').UserSession} UserSession
 */

/**
 * Creates a SessionManager instance with encapsulated state.
 * 
 * @returns {Object} SessionManager API
 */
function createSessionManager() {
  // Private state: in-memory session maps
  const sessionsByUserId = new Map();
  const sessionsBySocketId = new Map();

  /**
   * Create a new session for a user.
   * 
   * @param {string} userId - Database user ID
   * @param {string} socketId - Socket.io socket ID
   * @param {string} displayName - User's display name
   * @returns {UserSession} The created session
   * 
   * Requirements: 7.1, 7.4
   */
  function createSession(userId, socketId, displayName) {
    const session = {
      socketId,
      userId,
      displayName,
      score: 0,
      connectedAt: Date.now(),
      disconnectedAt: null,
      reconnectTimer: null
    };

    sessionsByUserId.set(userId, session);
    sessionsBySocketId.set(socketId, session);

    return session;
  }

  /**
   * Get session by user ID.
   * 
   * @param {string} userId - Database user ID
   * @returns {UserSession | undefined} Session if found
   * 
   * Requirements: 9.1, 9.2
   */
  function getSessionByUserId(userId) {
    return sessionsByUserId.get(userId);
  }

  /**
   * Get session by socket ID.
   * 
   * @param {string} socketId - Socket.io socket ID
   * @returns {UserSession | undefined} Session if found
   */
  function getSessionBySocketId(socketId) {
    return sessionsBySocketId.get(socketId);
  }

  /**
   * Update socket ID for reconnection.
   * Cancels any pending expiry timer and updates the session.
   * 
   * @param {string} userId - Database user ID
   * @param {string} newSocketId - New socket.io socket ID
   * @returns {boolean} True if session was found and updated
   * 
   * Requirements: 7.5, 9.2
   */
  function updateSocketId(userId, newSocketId) {
    const session = sessionsByUserId.get(userId);
    
    if (!session) {
      return false;
    }

    // Cancel expiry timer if exists
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    // Remove old socketId mapping
    sessionsBySocketId.delete(session.socketId);

    // Update session
    session.socketId = newSocketId;
    session.disconnectedAt = null;

    // Add new socketId mapping
    sessionsBySocketId.set(newSocketId, session);

    return true;
  }

  /**
   * Mark session as disconnected and start 30-second expiry timer.
   * 
   * @param {string} socketId - Socket.io socket ID
   * @returns {UserSession | undefined} The disconnected session if found
   * 
   * Requirements: 9.1, 9.3
   */
  function markDisconnected(socketId) {
    const session = sessionsBySocketId.get(socketId);
    
    if (!session) {
      return undefined;
    }

    session.disconnectedAt = Date.now();

    // Start 30-second expiry timer
    session.reconnectTimer = setTimeout(() => {
      removeSession(session.userId);
    }, 30000);

    return session;
  }

  /**
   * Remove session completely, freeing the display name.
   * 
   * @param {string} userId - Database user ID
   * @returns {boolean} True if session was found and removed
   * 
   * Requirements: 9.3
   */
  function removeSession(userId) {
    const session = sessionsByUserId.get(userId);
    
    if (!session) {
      return false;
    }

    // Clear any pending timer
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    // Remove from both maps
    sessionsByUserId.delete(userId);
    sessionsBySocketId.delete(session.socketId);

    return true;
  }

  /**
   * Get all active display names (for uniqueness checking).
   * 
   * @returns {Set<string>} Set of all active display names
   * 
   * Requirements: 7.2
   */
  function getActiveDisplayNames() {
    const names = new Set();
    for (const session of sessionsByUserId.values()) {
      names.add(session.displayName);
    }
    return names;
  }

  /**
   * Get all active sessions.
   * 
   * @returns {UserSession[]} Array of all active sessions
   */
  function getAllSessions() {
    return Array.from(sessionsByUserId.values());
  }

  // Public API
  return {
    createSession,
    getSessionByUserId,
    getSessionBySocketId,
    updateSocketId,
    markDisconnected,
    removeSession,
    getActiveDisplayNames,
    getAllSessions
  };
}

module.exports = {
  createSessionManager
};
