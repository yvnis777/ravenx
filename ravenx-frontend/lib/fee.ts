/**
 * RavenX's builder fee — the single source of truth for what we charge.
 *
 * Copy trading is free: BUILDER_ADDRESS is empty, so nothing is attached to
 * orders and nothing is signed. The fee rail is kept, dormant, for future
 * products. Must match BUILDER_ADDRESS / BUILDER_FEE_TENTHS_BPS in the
 * backend .env.
 */

/** Empty ⇒ fees are off: nothing is attached to orders, nothing is signed. */
export const BUILDER_ADDRESS = process.env.NEXT_PUBLIC_BUILDER_ADDRESS ?? ''

/** Fee in tenths of a basis point. 30 = 0.03%. HL caps perps at 100 (0.1%). */
export const BUILDER_FEE_TENTHS_BPS = Number(
  process.env.NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS ?? '30'
)

export const FEES_ENABLED = BUILDER_ADDRESS !== ''

/** "0.03%" — also the exact percent string HL wants in ApproveBuilderFee. */
export function feeRateLabel(tenthsBps = BUILDER_FEE_TENTHS_BPS): string {
  return `${String(tenthsBps / 1000)}%`
}

/**
 * The price we advertise. It derives from FEES_ENABLED so the public pages
 * always state exactly what is charged: never quote a fee we don't take, and
 * never take one we don't quote.
 */
export const ADVERTISED_FEE = FEES_ENABLED ? feeRateLabel() : '0%'
