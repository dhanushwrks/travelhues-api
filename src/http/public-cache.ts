/** Cache-Control for rarely changing public JSON responses (seconds). */
export const PUBLIC_JSON_CACHE_MAX_AGE = 300;

export const publicJsonCacheHeader = `public, max-age=${PUBLIC_JSON_CACHE_MAX_AGE}`;
