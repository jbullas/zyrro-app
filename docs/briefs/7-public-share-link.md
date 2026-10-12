# Brief: #7 Public share link for Identity

Let a user share the top of their Identity report publicly through a unique URL, with a CTA that sends visitors to `/start`. Social platforms show a preview image automatically when the link is posted.

**Principle: reuse, don't invent.** The public page shows the existing `/identity` hero exactly as it renders today. The only new UI is the Share button, the share panel and the prospect CTA, and each of those reuses existing components and CSS classes. No new classes where existing ones work.

---

## 1. What gets shared

The public page shows exactly the `/identity` hero section, unchanged:
- the hero row: identity card (eyebrow, Named Identity, "Prepared for {name}", identity thesis, constellation synthesis) and the Domain Profile card
- the Primary Signatures heading and the 5 signature cards (with the new bands from #160)

Then, in place of the hero Path CTA, a **prospect CTA** using the existing gradient CTA strip:
- Heading: "What's your signature?"
- Body: "Answer 13 questions and get your free Identity report."
- Button: "Discover your signature" → `/start`

Put the copy in `lib/identity-report-copy.ts` with the rest of the report copy.

Nothing else from the report appears: no secondaries, Signatures in Depth, pairings, distinctive pattern, energy/drains, pattern to notice, Path CTA or Path invitation.

**Extract, don't copy.** Move the hero section markup out of `app/identity/page.tsx` into one shared component that both `/identity` and the public page render. `/identity` must look exactly as it does now; it keeps its own hero Path CTA below the shared section. Apply the same missing-data rules for older reports.

---

## 2. The share link

- **Storage:** new table (migration), e.g. `identity_share_links`: `id`, `user_id`, `slug` (unique), `created_at`, `revoked_at` (nullable). Enable RLS with no client policies: only server code using the service role reads or writes it.
- **Slug:** random and unguessable, at least 10 characters, generated with a cryptographically secure source.
- **What a link shows:** the user's **current** ready `identity_report` at the time someone views it (`getCurrentArtifact`), not a snapshot.
- **One active link per user:** creating returns the existing active link if there is one. Revoking sets `revoked_at`. Sharing again after revoking creates a **new** slug; the old one stays dead.
- **Who can share:** any signed-in user with a ready identity report (free tier included).
- **API:** one route (e.g. `/api/share-link`): `POST` creates or returns the active link, `DELETE` revokes it. Both require auth and act only on the caller's own link.
- **Migration must be applied** to the dev Supabase project, and that verified, before relying on it. Committing the file is not enough.

---

## 3. The public page `/s/[slug]`

- Server-rendered. Look up the slug with the service client; unknown or revoked slug → 404 (`notFound()`).
- Load the user's current ready identity report and pass **only the hero fields** to anything rendered on the client. The full report content must not reach the browser: check the page source and the RSC payload.
- **Header:** logo only, no app nav and no account/login, the same rule the homepage already uses.
- **Footer:** the existing report footer (disclaimer only).
- `robots` meta: `noindex, nofollow`.
- **Middleware** (`utils/supabase/middleware.ts`): `/s/*` and its image route must be reachable without a session, with no redirect to login.

---

## 4. Preview image (Open Graph)

- Use the Next.js `opengraph-image` convention under `app/s/[slug]/` (`ImageResponse` from `next/og`), 1200×630.
- **Content:** the Named Identity as the title, the domain profile bar chart below it (5 bars, same order and values as the page), and "zyrro.ai" in a corner. Brand colours and fonts from the existing tokens in `globals.css`; load the brand font into `ImageResponse`.
- **Metadata** via `generateMetadata`: `og:title` (the Named Identity), `og:description` (one line inviting the visitor to discover their own signature), `og:url`, `og:image`, and `twitter:card` = `summary_large_image`. All URLs must be absolute; set `metadataBase` from the app's base URL.
- Unknown or revoked slug → the image route returns 404 as well.

---

## 5. Share button and panel on `/identity`

- **Share button** on the hero identity card (top right of the card), using an existing button style. Show it only to the report's owner on `/identity`, never on the public page.
- **Click** → the panel opens: modal on desktop, bottom sheet on mobile (under 700px, the breakpoint the header already uses). Reuse existing modal/sheet patterns if there are any; otherwise build it from existing card, button and spacing classes.
- On open, the panel calls `POST /api/share-link` (creating the link on first use) and shows:
  - the link with a **Copy** button (shows "Copied" briefly)
  - **LinkedIn**, **X** and **Facebook** buttons, each opening that platform's share URL in a new window with the link filled in:
    - LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url={url}`
    - X: `https://x.com/intent/post?url={url}`
    - Facebook: `https://www.facebook.com/sharer/sharer.php?u={url}`
  - on devices that support it (`navigator.share`), a **Share** button that opens the native share sheet with the link
  - a small **Stop sharing** link at the bottom: calls `DELETE`, then the panel closes and the link is dead
- After the link exists, the hero button reads **"Shared"** (still opens the panel).

---

## Verification

Live-verify every user-facing path. Paste full, unabridged output for every check. Verification scripts are temporary and deleted before committing.

1. **Migration applied:** show the table exists in the dev Supabase project with RLS on.
2. **/identity unchanged:** for a synthetic user with a 1.4 report, screenshot the hero at 1280 and 390 before and after the extraction; they must match, apart from the new Share button.
3. **Share flow (synthetic user, 1280 and 390):** open the panel → link created; reopen → same link; Copy works; the three platform buttons point to the right URLs with the link encoded; button reads "Shared".
4. **Public page, logged out (1280 and 390):** shows the hero + 5 cards + prospect CTA and nothing else; the CTA goes to `/start`; no app nav; `noindex` present. Screenshot both widths.
5. **No leak:** the public page's HTML and RSC payload contain none of: deep-dive text, evidence text, energisers/friction points, pattern to notice, secondaries. Show the check.
6. **Preview image:** the image route returns a 1200×630 PNG; show it. The page's `og:*` and `twitter:*` tags are present with absolute URLs.
7. **Revoke:** Stop sharing → page and image both 404; share again → new slug that works; old slug still 404.
8. **Not owner:** a different synthetic user can't revoke or read another user's link through the API.
9. Tear down all synthetic users and confirm they're gone.
10. `npx tsc --noEmit` and `npx next build` pass.

**Can't be verified locally, so hand it off explicitly:** a real social platform fetching the preview (e.g. LinkedIn Post Inspector). Once pushed, check whether the Vercel Preview `/s/*` URL is reachable without Vercel authentication (Deployment Protection). Report what you find; don't change Vercel settings. If it isn't reachable, the live platform-preview check is handed off to #149 (production cutover), and the changelog must say so.

---

## Stop conditions

Stop and report back before going further if:
- The app has no configured base URL to build absolute links from, and adding one would need a new environment variable.
- Making `/s/*` public needs more than allowlisting it in the middleware.
- Extracting the hero would change how `/identity` renders in any way other than adding the Share button.
- Serving the public page seems to require sending any report field beyond the hero fields to the browser.
- The brand font can't be loaded into `ImageResponse`.
- Any part needs a prompt change or a change to report generation.

---

## Commits

Separate commits, pushed to `dev`: (1) migration + share-link API, (2) hero extraction + public page + preview image, (3) share button + panel. Commit this brief on its own first, and delete it in its own commit once everything above is live-verified.
