"""
Copy engine entry point — V2.

Called from the WebSocket processor every time a target wallet has a fill.
Loads all active followers of that wallet (each is a Subscription with its
own agent) and runs execute_copy() per sub.
"""
import logging

from flask import Flask

logger = logging.getLogger(__name__)


def handle_fill(target_address: str, fill: dict, app: Flask):
    with app.app_context():
        from models.subscription import Subscription
        from services.copy_service import execute_copy

        subs = Subscription.query.filter_by(
            target_address=target_address.lower(),
            is_active=True,
        ).all()

        logger.info("handle_fill: target=%s subs_found=%d", target_address, len(subs))

        for sub in subs:
            try:
                execute_copy(
                    sub_id=sub.id,
                    parent_address=sub.parent_address,
                    agent_pkey=sub.agent_private_key,
                    target_address=sub.target_address,
                    scaling_pct=sub.scaling_pct,
                    risk_params=sub.risk_params or {},
                )
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    logger.warning("Sub %d rate-limited (429), retry next fill", sub.id)
                else:
                    logger.error("Sub %d failed: %s", sub.id, e)
                try:
                    from extensions import db
                    db.session.rollback()
                except Exception:
                    pass
