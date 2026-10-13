#!/usr/bin/env python3
"""
Manually run one harvest + enrichment cycle.
Use this to seed the traders table on first run or to force a refresh.

Usage:
    python seed_traders.py              # harvest + enrich (default 50 wallets)
    python seed_traders.py --harvest    # harvest only
    python seed_traders.py --enrich     # enrich only
"""
import os
import sys

os.environ.setdefault("DISABLE_BACKGROUND_WORKERS", "1")

from app import create_app  # noqa: E402

app = create_app()

harvest = "--enrich" not in sys.argv
enrich = "--harvest" not in sys.argv

with app.app_context():
    if harvest:
        print("=== Harvesting wallet addresses ===")
        from workers.wallet_harvester import harvest_wallets
        harvest_wallets(app)

    if enrich:
        print("\n=== Enriching wallets ===")
        from workers.trader_scanner import scan_and_rank_traders
        scan_and_rank_traders(app)

    from models.trader import Trader
    from models.discovered_wallet import DiscoveredWallet
    print(f"\nResult: {DiscoveredWallet.query.count()} discovered, {Trader.query.count()} enriched traders")
