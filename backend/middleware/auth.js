const { verifyToken } = require('../lib/auth');
const { readDb } = require('../lib/db');

function unauthorized(res, message) {
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message },
    timestamp: Date.now()
  });
}

/** Requires a valid Bearer JWT. Populates req.auth = { sub, role, kioskId, ... }. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return unauthorized(res, 'Access token required');

  try {
    req.auth = verifyToken(token);
    next();
  } catch (err) {
    return unauthorized(res, 'Invalid or expired token');
  }
}

/** Use after requireAuth. Restricts a route to specific roles. */
function requireRole(...roles) {
  const norm = (r) => String(r || '').toLowerCase().replace(/[-_]/g, '');
  const allowed = roles.map(norm);
  return (req, res, next) => {
    if (!req.auth || !allowed.includes(norm(req.auth.role))) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action' },
        timestamp: Date.now()
      });
    }
    next();
  };
}

/** Use after requireAuth. Check if user has specific permission. */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        timestamp: Date.now()
      });
    }

    // Admins and super admins have all permissions
    if (req.auth.role === 'admin' || req.auth.role === 'super_admin' || req.auth.role === 'super-admin') {
      return next();
    }

    // Allow wardens to access settings
    if (req.auth.role === 'warden') {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: `Permission '${permission}' required` },
      timestamp: Date.now()
    });
  };
}

module.exports = { requireAuth, requireRole, requirePermission };
