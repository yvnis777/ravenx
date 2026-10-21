import fcntl
import logging
import threading
import time

from flask import Flask
from flask_cors import CORS

from config import Config
from extensions import db, jwt


def create_app():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    import hl_env
    log = logging.getLogger("ravenx")
    if hl_env.IS_MAINNET:
        log.info("Hyperliquid network: MAINNET (%s)", hl_env.API_URL)
    else:
        log.warning("=" * 60)
        log.warning("Hyperliquid network: TESTNET (%s) — no real funds", hl_env.API_URL)
        log.warning("=" * 60)

    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"])

    from routes.auth import auth_bp
    from routes.agent import agent_bp
    from routes.copy import copy_bp
    from routes.dashboard import dashboard_bp
    from routes.notifications import notifications_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(agent_bp, url_prefix="/agent")
    app.register_blueprint(copy_bp, url_prefix="/copy")
    app.register_blueprint(dashboard_bp, url_prefix="/dashboard")
    app.register_blueprint(notifications_bp, url_prefix="/notifications")

    with app.app_context():
        # Fail at boot, not on the first copy, if the agent-key master key is missing or malformed
        from models.encrypted import _cipher
        _cipher()

        # Touch every model so SQLAlchemy registers the tables
        import models.agent_wallet  # noqa: F401
        import models.discovered_wallet  # noqa: F401
        import models.notification  # noqa: F401
        import models.position  # noqa: F401
        import models.subscription  # noqa: F401
        import models.trader  # noqa: F401
        import models.user  # noqa: F401
        import models.nonce  # noqa: F401
        db.create_all()
        _add_missing_columns()
        _relax_subscription_agent_address()

        if not app.config.get("DISABLE_BACKGROUND_WORKERS"):
            _start_services_when_lock_free(app)

    @app.route("/health")
    def health_check():
        return {"status": "ok", "hl_env": hl_env.HL_ENV}

    return app


def _add_missing_columns():
    """Add columns introduced after a table was first created.

    create_all() only creates missing tables, never missing columns, and there
    is no Alembic yet. Each entry here is idempotent.
    """
    from sqlalchemy import inspect, text
    from models.subscription import Subscription

    added = [(Subscription.__table__, "held_at_start")]
    insp = inspect(db.engine)
    for table, name in added:
        if name in {c["name"] for c in insp.get_columns(table.name)}:
            continue
        col_type = table.c[name].type.compile(dialect=db.engine.dialect)
        with db.engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {name} {col_type}"))
        logging.getLogger(__name__).info("Added column %s.%s", table.name, name)


def _relax_subscription_agent_address():
    """Let copies share an agent: subscriptions.agent_address was once
    NOT NULL and UNIQUE (one agent per copy). Idempotent."""
    from sqlalchemy import inspect, text
    from models.subscription import Subscription

    insp = inspect(db.engine)
    col = next(c for c in insp.get_columns("subscriptions") if c["name"] == "agent_address")
    uniques = [u["name"] for u in insp.get_unique_constraints("subscriptions")
               if u["column_names"] == ["agent_address"]]
    # Postgres also lists the index behind a UNIQUE constraint; dropping the
    # constraint drops that index, so only standalone unique indexes count.
    indexes = [i["name"] for i in insp.get_indexes("subscriptions")
               if i.get("unique") and i["column_names"] == ["agent_address"]
               and not i.get("duplicates_constraint") and i["name"] not in uniques]
    if col["nullable"] and not uniques and not indexes:
        return

    if db.engine.dialect.name == "postgresql":
        with db.engine.begin() as conn:
            conn.execute(text("ALTER TABLE subscriptions ALTER COLUMN agent_address DROP NOT NULL"))
            for name in uniques:
                conn.execute(text(f'ALTER TABLE subscriptions DROP CONSTRAINT "{name}"'))
            for name in indexes:
                conn.execute(text(f'DROP INDEX "{name}"'))
    else:
        # SQLite can't drop a constraint in place; rebuilding is only safe empty.
        with db.engine.connect() as conn:
            rows = conn.execute(text("SELECT COUNT(*) FROM subscriptions")).scalar()
        if rows:
            raise RuntimeError(
                "subscriptions.agent_address is still UNIQUE and the table has rows. "
                "This dev database predates shared agents: delete it and restart."
            )
        Subscription.__table__.drop(db.engine)
        Subscription.__table__.create(db.engine)
    logging.getLogger(__name__).info("Relaxed subscriptions.agent_address for shared agents")


# ── One copy engine per host ──────────────────────────────────────────────────
# The copy engine lives inside the web process. A second process (an extra
# gunicorn worker, a stray `flask run`) would copy every fill again — double
# positions on users' real accounts. An exclusive flock makes the engine a
# per-host singleton; the fd stays open for the life of the process.
_engine_lock_fd = None


def _try_engine_lock(path: str) -> bool:
    """Take the engine lock without blocking. True if this process holds it."""
    global _engine_lock_fd
    if _engine_lock_fd is not None:
        return True
    fd = open(path, "a")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fd.close()
        return False
    _engine_lock_fd = fd
    return True


def _start_services_when_lock_free(app, poll_seconds: float = 2.0, wait_in_background: bool = True):
    """Start background services once this process holds the engine lock.

    On a graceful reload the new worker boots before the old one exits, so a busy
    lock is waited on, never given up on — giving up would leave no engine at all.
    """
    log = logging.getLogger(__name__)
    path = app.config["COPY_ENGINE_LOCK_FILE"]
    if _try_engine_lock(path):
        _start_background_services(app)
        return

    log.warning("Copy engine lock %s is held by another process; waiting for it", path)

    def wait_then_start():
        while not _try_engine_lock(path):
            time.sleep(poll_seconds)
        log.info("Copy engine lock acquired; starting background services")
        _start_background_services(app)

    if wait_in_background:
        threading.Thread(target=wait_then_start, daemon=True, name="engine-lock-wait").start()
    else:
        wait_then_start()


def _start_background_services(app):
    from monitoring.websocket_manager import WebSocketManager

    # Copy monitoring always runs: it watches targets and places followers' orders.
    WebSocketManager.get_instance().start_in_background(app)

    if app.config.get("ENABLE_LEADERBOARD"):
        _start_leaderboard_services(app)
    else:
        logging.getLogger(__name__).info("Leaderboard disabled — wallet discovery workers not started")


def _start_leaderboard_services(app):
    """Wallet discovery + enrichment feeding /dashboard. Nothing in the copy path depends on it."""
    from monitoring.price_feed import PriceFeed
    from workers.wallet_harvester import harvest_wallets
    from workers.trader_scanner import (
        scan_and_rank_traders,
        deep_enrich_traders,
        refresh_live_metrics,
        LIVE_REFRESH_INTERVAL_MINUTES,
    )
    from workers.trade_stream_harvester import start_trade_stream
    from apscheduler.schedulers.background import BackgroundScheduler

    PriceFeed.get_instance().start_in_background(app)
    start_trade_stream(app)

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(func=lambda: harvest_wallets(app), trigger="interval",
                      minutes=5, id="wallet_harvester", replace_existing=True)
    scheduler.add_job(func=lambda: scan_and_rank_traders(app), trigger="interval",
                      minutes=5, id="trader_scanner", replace_existing=True)
    scheduler.add_job(func=lambda: deep_enrich_traders(app), trigger="interval",
                      minutes=5, id="deep_enricher", replace_existing=True)
    scheduler.add_job(func=lambda: refresh_live_metrics(app), trigger="interval",
                      minutes=LIVE_REFRESH_INTERVAL_MINUTES, id="live_refresh",
                      replace_existing=True)
    scheduler.start()

    import threading
    import time as _time

    def _staggered_start():
        for delay, fn, args in [
            (0, harvest_wallets, (app,)),
            (30, scan_and_rank_traders, (app,)),
            (60, deep_enrich_traders, (app,)),
            (90, refresh_live_metrics, (app,)),
        ]:
            _time.sleep(delay)
            try:
                fn(*args)
            except Exception as e:
                logging.getLogger(__name__).error("Startup job %s failed: %s",
                                                  fn.__name__, e)
    threading.Thread(target=_staggered_start, daemon=True).start()


if __name__ == "__main__":
    app = create_app()
    app.run(debug=False, host="0.0.0.0", port=5000)
