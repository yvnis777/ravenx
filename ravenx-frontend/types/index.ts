// types/index.ts

export interface OpenPosition {
  coin: string
  szi: number
  entry_px: number
  upnl?: number
  leverage?: number
  liq_px?: number | null
  position_value?: number
  margin_used?: number
}

export interface Trader {
  address: string
  display_name: string | null
  pnl: number
  upnl: number
  perp_equity: number
  win_rate: number
  long_pnl: number
  short_pnl: number
  growth_rate: number
  trade_count: number
  win_count: number
  loss_count: number
  tx_count: number
  open_positions: OpenPosition[]
  pnl_1d?: number | null
  pnl_7d?: number | null
  pnl_30d?: number | null
  pnl_90d?: number | null
  trades_1d?: number | null
  trades_7d?: number | null
  trades_30d?: number | null
  trades_90d?: number | null
  win_rate_1d?: number | null
  win_rate_7d?: number | null
  win_rate_30d?: number | null
  win_rate_90d?: number | null
  last_updated: string
}

export interface PnlDataPoint {
  time: number
  value: number
}

export interface PnlHistoryResponse {
  period: string
  data: PnlDataPoint[]
  total_pnl: number
  fill_count: number
}

export interface Subscription {
  id: number
  parent_address: string
  agent_address: string
  target_address: string
  target_name?: string | null
  scaling_pct: number
  is_active: boolean
  risk_params: {
    stop_loss_pct?: number
    max_drawdown_pct?: number
    max_position_usd?: number
    min_position_usd?: number
    price_tolerance_pct?: number
    copy_existing_mode?: 'none' | 'favorable' | 'market'
  }
  peak_equity?: number | null
  created_at?: string
  stopped_at?: string | null
  last_polled_at?: string | null
  last_error?: string | null
}

export interface TradersResponse {
  traders: Trader[]
  total: number
  page: number
  pages: number
  per_page: number
}

export interface ApiError {
  error: string
}

export type SortField = 'pnl' | 'win_rate' | 'perp_equity' | 'trade_count' | 'growth_rate' | 'upnl' | 'pnl_1d' | 'pnl_7d' | 'pnl_30d' | 'pnl_90d'
export type SortOrder = 'asc' | 'desc'

export interface TraderFilters {
  sort_by: SortField
  order: SortOrder
  page: number
  search?: string
  min_pnl?: number
  max_pnl?: number
  min_win_rate?: number
  max_win_rate?: number
  min_trades?: number
  max_trades?: number
  min_equity?: number
  max_equity?: number
}
