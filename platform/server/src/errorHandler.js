const { STATUS_CODES } = require('node:http');

const unavailableCodes = new Set([
  '3D000', '53300', '57P01', '57P02', '57P03',
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENOTFOUND',
]);

module.exports = function errorHandler(error, req, res, next) {
  console.error(`Request failed: ${req.method} ${req.path}`, error);
  if (res.headersSent) return next(error);

  if (unavailableCodes.has(error.code) || /^08/.test(error.code || '')) {
    return res.status(503).json({ error: 'Database unavailable. Please try again shortly.' });
  }

  const requestedStatus = error.status || error.statusCode;
  const status = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus : 500;
  const message = status < 500 ? STATUS_CODES[status] || 'Request failed' : 'Internal server error';
  return res.status(status).json({ error: message });
};
