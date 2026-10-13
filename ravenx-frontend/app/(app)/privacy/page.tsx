export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-7 px-6 py-12">
      <div>
        <h1 className="text-xl font-semibold text-fg">Privacy Policy</h1>
        <p className="mt-1 text-[11px] text-faint">Last updated: September 2026</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">1. What We Collect</h2>
        <p className="text-[13px] leading-relaxed text-muted">RavenX collects minimal data. We store:</p>
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
          <li>Your Hyperliquid wallet address (used for authentication)</li>
          <li>
            Agent wallet addresses and their private keys, used to place your copied orders. Keys are
            encrypted at rest; an agent can trade but can never withdraw funds.
          </li>
          <li>Copy-trading subscription settings (target address, scaling, risk parameters)</li>
          <li>Trade execution records and notifications for audit purposes</li>
        </ul>
        <p className="text-[13px] leading-relaxed text-muted">
          We do not collect email addresses, names, phone numbers, or any personally identifiable
          information beyond your wallet address.
        </p>
        <p className="text-[13px] leading-relaxed text-muted">
          We use this data to run the service and to understand usage in aggregate — for example,
          which wallets are copied most often. We do not sell it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">2. How We Use Data</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Your data is used exclusively to operate the copy-trading service: authenticating your
          session, placing orders on your behalf, and displaying your subscriptions and activity.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">3. Keys and Custody</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          RavenX never asks for, receives, or stores your wallet&apos;s private key. Authentication
          uses EIP-191 signatures only, and we have no withdrawal access to your funds at any time.
        </p>
        <p className="text-[13px] leading-relaxed text-muted">
          To place orders we generate an agent wallet per subscription and store its private key on
          our server. Under Hyperliquid&apos;s rules an agent can only trade — it cannot withdraw or
          transfer your assets — so the worst case if that key were exposed is unwanted trading on
          your account, never loss of custody. Agent keys are deleted once a subscription has been
          inactive for 90 days, and you can revoke an agent yourself on Hyperliquid at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">4. Data Sharing</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          We do not sell, rent, or share your data with third parties. Your wallet address and
          orders interact with the Hyperliquid API as required for the service to function.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">5. Leaderboard Data</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          The trader leaderboard displays publicly available on-chain data — wallet addresses, PnL
          and positions — aggregated from Hyperliquid&apos;s public API. This data is available to
          anyone and is not private. If you trade on Hyperliquid, your wallet may appear on the
          leaderboard whether or not you use RavenX.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">6. Cookies &amp; Local Storage</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          We use localStorage to hold your session token and a cached counter value on the landing
          page. We do not use tracking cookies or third-party analytics.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">7. Data Retention</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Subscription history is retained while your account exists. Agent private keys are deleted
          after 90 days of inactivity, while the agent address is kept for audit purposes. Trade
          execution records are retained for audit purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">8. Your Rights</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          You can stop copy trading at any time from the Platform, and revoke the agent wallet
          directly on Hyperliquid. Your funds are always under your own control and are never held
          by RavenX. To request deletion of all your data, contact us via the Platform.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-fg">9. Changes</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          We may update this Privacy Policy at any time. Changes take effect upon posting to the
          Platform.
        </p>
      </section>
    </div>
  )
}
