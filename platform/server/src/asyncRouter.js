const express = require('express');
const { METHODS } = require('node:http');

function wrapHandler(handler) {
  if (Array.isArray(handler)) return handler.map(wrapHandler);
  if (typeof handler !== 'function') return handler;
  if (handler.length === 4) {
    return function asyncErrorHandler(error, req, res, next) {
      return Promise.resolve(handler(error, req, res, next)).catch(next);
    };
  }
  return function asyncHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Express 4 does not forward rejected promises to error middleware. Wrap at
// registration so both router.get(...) and router.route(...).get(...) are safe.
module.exports = function createAsyncRouter(options) {
  const router = express.Router(options);
  const registerRoute = router.route;
  router.route = function routeWithAsyncHandlers(path) {
    const route = registerRoute.call(this, path);
    for (const method of [...METHODS.map(value => value.toLowerCase()), 'all']) {
      if (typeof route[method] !== 'function') continue;
      const registerHandler = route[method];
      route[method] = function registerAsyncHandlers(...handlers) {
        return registerHandler.apply(this, handlers.map(wrapHandler));
      };
    }
    return route;
  };
  return router;
};
