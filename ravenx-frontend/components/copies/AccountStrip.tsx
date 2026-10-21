import { StatTile } from '@/components/ui/StatTile'
import { fmtMoney } from '@/lib/format'

/** HL's minimum order value: smaller copies are skipped. */
const MIN_ORDER_USD = 10

interface AccountStripProps {
  equity: number | undefined
  exposure: number
  upnl: number
  marginUsed: number
  activeCopies: number
}

const tone = (n: number): 'profit' | 'loss' | 'neutral' => (n > 0 ? 'profit' : n < 0 ? 'loss' : 'neutral')

export function AccountStrip({ equity, exposure, upnl, marginUsed, activeCopies }: AccountStripProps) {
  const leverage = equity ? exposure / equity : 0
  return (
    <div className="border-b border-line">
      <div className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-5">
        <StatTile label="Equity" value={fmtMoney(equity)} />
        <StatTile
          label="Exposure"
          value={fmtMoney(exposure)}
          sub={equity ? `${leverage.toFixed(2)}× equity` : undefined}
        />
        <StatTile label="Unrealized PnL" value={fmtMoney(upnl, true)} tone={tone(upnl)} />
        <StatTile label="Margin used" value={fmtMoney(marginUsed)} />
        <StatTile label="Active copies" value={String(activeCopies)} />
      </div>
      {equity !== undefined && equity <= 0 && (
        <p role="status" className="border-t border-line bg-accent-dim px-3 py-2 text-[11px] text-fg">
          No USDC available on your Hyperliquid account. Deposit or transfer USDC there and your copies
          start trading on the next move of the wallets you copy.
        </p>
      )}
      {equity !== undefined && equity > 0 && equity < 50 * MIN_ORDER_USD && (
        <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
          Hyperliquid rejects orders under ${MIN_ORDER_USD}, so a trade is only copied when your share of
          it reaches ${MIN_ORDER_USD}. With {fmtMoney(equity)}, many trades will be skipped as too small —
          more USDC or a higher Scale copies more of them.
        </p>
      )}
    </div>
  )
}
