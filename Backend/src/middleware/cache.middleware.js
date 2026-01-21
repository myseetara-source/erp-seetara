/**
 * Cache Middleware (PERF-003)
 * 
 * Sets appropriate Cache-Control headers for different API responses.
 * 
 * STRATEGY:
 * - Static Data (Categories, Delivery Zones): Long cache (1 hour)
 * - Semi-Static Data (Product List): Short cache (1 minute)
 * - Dynamic Data (Orders, Stock): No cache (private)
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
 */

/**
 * Cache durations in seconds
 */
export const CACHE_DURATION = {
  NONE: 0,           // No cache (real-time data)
  SHORT: 60,         // 1 minute (product stock can change)
  MEDIUM: 300,       // 5 minutes (product list, search results)
  LONG: 3600,        // 1 hour (categories, zones, config)
  STATIC: 86400,     // 24 hours (truly static data)
};

/**
 * Create cache middleware with specified duration
 * 
 * @param {number} maxAge - Cache duration in seconds
 * @param {boolean} isPrivate - Whether cache is private (user-specific)
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/categories', cache(CACHE_DURATION.LONG), getCategories);
 */
export function cache(maxAge, isPrivate = false) {
  return (req, res, next) => {
    // Skip caching for mutations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.set('Cache-Control', 'no-store');
      return next();
    }

    // Skip caching if user is authenticated and data is private
    const cacheType = isPrivate ? 'private' : 'public';
    
    if (maxAge === 0) {
      res.set('Cache-Control', 'no-store');
    } else {
      res.set('Cache-Control', `${cacheType}, max-age=${maxAge}`);
      
      // Add ETag support for conditional requests
      res.set('Vary', 'Authorization, Accept-Encoding');
    }
    
    next();
  };
}

/**
 * No cache middleware (for real-time data)
 * Use for: Orders, Stock levels, User data
 */
export function noCache() {
  return cache(CACHE_DURATION.NONE);
}

/**
 * Short cache middleware (1 minute)
 * Use for: Product variants (stock can change)
 */
export function shortCache() {
  return cache(CACHE_DURATION.SHORT, true);
}

/**
 * Medium cache middleware (5 minutes)
 * Use for: Product list, Search results
 */
export function mediumCache() {
  return cache(CACHE_DURATION.MEDIUM, true);
}

/**
 * Long cache middleware (1 hour)
 * Use for: Categories, Delivery Zones, Config
 */
export function longCache() {
  return cache(CACHE_DURATION.LONG);
}

/**
 * Static cache middleware (24 hours)
 * Use for: Truly static assets, Enums
 */
export function staticCache() {
  return cache(CACHE_DURATION.STATIC);
}

/**
 * Helper: Set cache headers directly on response
 * Use when you need to set cache after processing
 * 
 * @example
 * const data = await fetchData();
 * setCacheHeaders(res, CACHE_DURATION.LONG);
 * res.json({ success: true, data });
 */
export function setCacheHeaders(res, maxAge, isPrivate = false) {
  const cacheType = isPrivate ? 'private' : 'public';
  
  if (maxAge === 0) {
    res.set('Cache-Control', 'no-store');
  } else {
    res.set('Cache-Control', `${cacheType}, max-age=${maxAge}`);
  }
}

export default {
  cache,
  noCache,
  shortCache,
  mediumCache,
  longCache,
  staticCache,
  setCacheHeaders,
  CACHE_DURATION,
};
