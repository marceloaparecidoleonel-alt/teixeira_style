const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'teixeira-secret-key-2024';

function authenticateToken(req, res, next) {
  // TODO: re-enable auth when ready
  req.user = { id: 1, username: 'admin' };
  next();
}

module.exports = { authenticateToken, JWT_SECRET };
