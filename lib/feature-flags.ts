// #162: environment switches for the identity-only offer. A missing value
// behaves as today, so existing environments need no change.

// When false, Dashboard, Path, Plan and Mentor are hidden: out of the nav,
// their routes redirect to /identity (proxy.ts), and no CTA leads to /path.
// Read as a literal process.env.NEXT_PUBLIC_* so Next inlines it client-side.
export const PATH_ENABLED = process.env.NEXT_PUBLIC_PATH_ENABLED !== 'false';

// When true, unpaid users get the free sections of the Identity report plus
// locks; holders of identity_unlock or onetime_payment get it all
// (app/api/identity-report). Server-only: not NEXT_PUBLIC, so it reads false
// in the browser. The browser only ever learns `locked` from the route.
export const REPORT_PAYWALL = process.env.REPORT_PAYWALL === 'true';
