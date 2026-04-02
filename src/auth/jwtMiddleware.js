const { verifyToken } = require('./jwtUtils');

/**
 * Express middleware to authenticate JWT tokens from Authorization header
 * Extracts token from "Bearer <token>" format, verifies signature and expiration,
 * and attaches decoded payload to req.user
 * 
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {void}
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid token'
    });
  }

  // Extract token (remove "Bearer " prefix)
  const token = authHeader.substring(7);

  try {
    // Verify token signature and expiration
    const payload = verifyToken(token);
    
    // Attach decoded payload to req.user
    req.user = payload;
    
    // Continue to next middleware/route handler
    next();
  } catch (err) {
    // Token verification failed (invalid signature, expired, malformed)
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Socket.io middleware to authenticate JWT tokens from handshake auth
 * Extracts token from socket.handshake.auth.token, verifies signature and expiration,
 * and attaches decoded payload to socket.data.user
 * 
 * @param {import('socket.io').Socket} socket - Socket.io socket object
 * @param {Function} next - Socket.io next function
 * @returns {void}
 */
function authenticateSocketJWT(socket, next) {
  const token = socket.handshake.auth.token;

  // Check if token exists
  if (!token) {
    return next(new Error('Authentication error: Missing token'));
  }

  try {
    // Verify token signature and expiration
    const payload = verifyToken(token);
    
    // Attach decoded payload to socket.data.user
    socket.data.user = payload;
    
    // Continue with connection
    next();
  } catch (err) {
    // Token verification failed (invalid signature, expired, malformed)
    return next(new Error('Authentication error: Invalid or expired token'));
  }
}

module.exports = {
  authenticateJWT,
  authenticateSocketJWT
};
