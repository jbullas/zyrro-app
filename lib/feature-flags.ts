// #162: environment switches for the identity-only offer. A missing value
// behaves as today, so existing environments need no change.

// When false, Dashboard, Path, Plan and Mentor are hidden: out of the nav,
// their routes redirect to /identity (proxy.ts), and no CTA leads to /path.
// Read as a literal process.env.NEXT_PUBLIC_* so Next inlines it client-side.
export const PATH_ENABLED = process.env.NEXT_PUBLIC_PATH_ENABLED !== 'false';
