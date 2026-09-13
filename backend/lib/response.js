function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({ success: true, data, timestamp: Date.now() });
}

function sendError(res, code, message, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: { code, message }, timestamp: Date.now() });
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch ?? base;
  if (patch && typeof patch === 'object' && base && typeof base === 'object') {
    const out = { ...base };
    for (const key of Object.keys(patch)) out[key] = deepMerge(base[key], patch[key]);
    return out;
  }
  return patch === undefined ? base : patch;
}

module.exports = { sendSuccess, sendError, asyncRoute, deepMerge };
