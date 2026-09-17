/**
 * Stand-in for `astro:middleware`, a virtual module that only exists inside the
 * Astro build. `defineMiddleware` is identity there — it exists for the types —
 * so the real handler runs unchanged under vitest.
 */
export const defineMiddleware = <T>(handler: T): T => handler
