# RavenX — Frontend

Next.js 16 (App Router) frontend for the RavenX copy-trading platform.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run test:run   # run all tests (vitest)
npx tsc --noEmit   # type check
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Wallet | wagmi v2 + viem + Reown AppKit (universal wallet picker) |
| Server state | TanStack Query v5 |
| Styling | Tailwind CSS v4 + a token-based terminal theme |
| Auth | JWT in localStorage via `useAuth()` |
| HTTP | Axios with JWT interceptor (backend), direct fetch (Hyperliquid) |
| Charts | TradingView lightweight-charts v5 |
| Fonts | Inter (UI), JetBrains Mono (all numbers), Chakra Petch (wordmark only) |
| Tests | Vitest + React Testing Library |

## Design System

**Pro trading terminal: dense, flat, data-first. Dark only.** No glassmorphism, no blur, no glow, no gradient borders — those were removed in the 2026-09 redesign along with light mode.

All tokens live in `app/globals.css` under `:root` and are exposed as Tailwind utilities via `@theme inline`. **Components must never hardcode a color.**

| Token | Utility | Use |
|-------|---------|-----|
| `--surface` #0a0a0c | `bg-surface` | Page background |
| `--panel` #101014 | `bg-panel` | Panels, table headers, nav, modals |
| `--raised` #17171d | `bg-raised` | Inputs, hovered rows, menus |
| `--line` / `--line-strong` | `border-line` / `border-line-strong` | 1px dividers, emphasised edges |
| `--fg` / `--muted` / `--faint` | `text-fg` / `text-muted` / `text-faint` | Three text levels, all WCAG AA on panel |
| `--accent` #f5a623 | `text-accent`, `bg-accent`, `bg-accent-dim` | The **only** interactive color |
| `--profit` / `--loss` | `text-profit` / `text-loss` | **Money only** |

- **Green and red are reserved for profit and loss.** Interface state uses the gold accent — that's why `WinRateBar` is gold, not green.
- **Every number gets `.num`** (JetBrains Mono + tabular figures). Columns of figures are unreadable otherwise.
- **Density**: `--row-h` 32px table rows, `--control-h` 30px controls, 44px nav. Radii are tight (2–6px), never pill-shaped.
- **`.modal`** is the dialog surface (panel bg, strong border, shadow, short entrance animation, reduced-motion guard).
- **`.wordmark`** is the only place Chakra Petch is used.

### Primitives (`components/ui/`)

`Button` (primary gold / secondary / ghost / danger), `Input`, `Badge`, `Panel` (bordered region + optional header), `Tabs` (underline | segmented), `StatTile` (label + mono figure + optional sub), `Spinner`, `Sparkline`, `WinRateBar`, `ErrorBoundary`.

## Routes

```
app/
├── page.tsx                        # Landing (public, own header — no TopNav)
├── (app)/                          # Public app routes, TopNav, no auth redirect
│   ├── dashboard/page.tsx          # Leaderboard: cohort strip + filter rail + table
│   ├── traders/[address]/page.tsx  # Trader detail: command bar, chart, activity, stat rail
│   ├── cohorts/[name]/page.tsx     # Cohort detail
│   └── terms, privacy
└── (protected)/                    # Layout redirects to / when unauthenticated
    └── copies/page.tsx             # My Copies table
```

## Data Architecture

- **Leaderboard, cohorts, stats**: backend API (`/dashboard/*`) — cached data from the scanner.
- **Trader detail**: fetched **directly from the Hyperliquid API**, not the backend. Any address works, even one not in our DB.
  - `useTrader` → `clearinghouseState` (equity, uPnL, positions), polled every 10s; `useHLSubscription` refetches on WS events.
  - `usePnlHistory` / `usePortfolio` → `portfolio`: period PnL, chart and growth, using the perps-only windows. Exact for any period — use it for anything PnL.
  - `useFills` → `userFillsByTime`, paged. Win rate, trade count and long/short split come from here. **HL keeps only a wallet's newest 10,000 fills**, so for busy wallets these cover hours, not the period; `TraderMetrics` says so via `fillsCoverStart`.
  - Periods are 1D / 7D / 30D / All — `portfolio` has no 90-day window.
- **Subscriptions**: backend (`/copy/*`) via `useSubscriptions`.

## Copy Flow

`useAgentApproval` orchestrates the whole thing:

1. **Builder fee** — skipped entirely when `NEXT_PUBLIC_BUILDER_ADDRESS` is empty, or when `fetchMaxBuilderFee` shows the account already approved at least our rate. Otherwise the user signs `ApproveBuilderFee`.
2. **Agent** — `POST /agent/generate`, then the user signs `ApproveAgent`, submitted to HL's `/exchange`.
3. `POST /copy/start` — the backend re-verifies both approvals on-chain before creating the subscription.

The fee is signed **first**, so declining it means no agent was ever created. `lib/fee.ts` is the single source of truth for the rate and must match the backend's `BUILDER_ADDRESS` / `BUILDER_FEE_TENTHS_BPS`.

## Key Gotchas

- **Next.js 16 has breaking changes** from older versions (APIs, conventions, file layout). The docs bundled in `node_modules/next/dist/docs/` match the installed version — check them before relying on older examples.
- **Tailwind v4**: no `tailwind.config.ts`. New tokens go in `app/globals.css` under `@theme inline`.
- **Dark only.** There is no theme toggle and no `useTheme` hook. `data-theme="dark"` is hardcoded on `<html>`. Adding light mode means adding a second token block — never per-class overrides, which is what made the old contrast bugs unfixable.
- **`lib/fee.ts` has no wagmi import** on purpose, so the landing page can show pricing without pulling the wallet stack into its bundle. `useAgentApproval` re-exports it for convenience.
- **Pricing copy is derived, never written by hand.** The landing page and CopyModal both read `FEES_ENABLED` / `feeRateLabel()`, so they cannot advertise a price different from the one charged.
- **JWT key**: `localStorage.ravenx_token`. The Axios instance attaches it; the 401 interceptor only clears it for non-public routes.
- **Route groups**: `(app)` is public with `TopNav`; `(protected)` redirects when unauthenticated.
- **Period PnL**: dashboard filters by 1D/7D/30D/90D/All using `pnl_1d`…`pnl_90d`, with period-specific win rate and trade counts.
- **Wallet connection** uses Reown AppKit — there is no custom connector modal.
- **Backend URL**: `NEXT_PUBLIC_API_URL` in `.env.local` (default `http://localhost:5000`).
- **lightweight-charts needs literal hex**, not CSS variables. `PnlChart` keeps a `C` constant mirroring the tokens — update both together.

## Environment

```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.reown.com>
NEXT_PUBLIC_BUILDER_ADDRESS=            # empty ⇒ no fees, single signature
NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS=30   # 30 = 0.03%
NEXT_PUBLIC_ENABLE_LEADERBOARD=         # empty ⇒ leaderboard hidden (launch setup); 1 ⇒ back on
```

## Leaderboard switch

`lib/features.ts` → `LEADERBOARD_ENABLED`. **Off for launch**; must match `ENABLE_LEADERBOARD` in the backend.

- **Off:** `/dashboard` renders `CopyAWallet` (paste box + links to external wallet finders); `/cohorts/*` redirects there; the nav item reads "Copy a wallet" and the nav search becomes `AddressInput`; the landing page leads with the paste box and drops the wallet count.
- **On:** everything behaves as before. The leaderboard code is untouched — only hidden.
- `AddressInput` validates `0x` + 40 hex and routes to `/traders/<address>`, which reads Hyperliquid directly and works for any wallet.
