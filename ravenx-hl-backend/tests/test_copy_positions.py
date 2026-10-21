"""GET /copy/positions: each of my active copies' recorded share per coin."""
from flask_jwt_extended import create_access_token

from extensions import db
from models.position import TrackedPosition
from models.subscription import Subscription
from models.user import ParentWallet

ME = "0x" + "a" * 40
SOMEONE_ELSE = "0x" + "b" * 40


def _sub(parent, active=True, target="0x" + "d" * 40):
    s = Subscription(parent_address=parent, target_address=target, is_active=active)
    db.session.add(s)
    db.session.commit()
    return s


def _get(app, who=ME):
    with app.app_context():
        token = create_access_token(identity=who)
    return app.test_client().get("/copy/positions", headers={"Authorization": f"Bearer {token}"})


def test_lists_my_active_copies_shares_only(app):
    with app.app_context():
        db.session.add_all([ParentWallet(address=ME), ParentWallet(address=SOMEONE_ELSE)])
        mine = _sub(ME)
        stopped = _sub(ME, active=False)
        theirs = _sub(SOMEONE_ELSE)
        db.session.add_all([
            TrackedPosition(subscription_id=mine.id, coin="BTC", szi=0.5, entry_px=100.0),
            TrackedPosition(subscription_id=mine.id, coin="ETH", szi=-2.0, entry_px=10.0),
            TrackedPosition(subscription_id=stopped.id, coin="SOL", szi=1.0, entry_px=5.0),
            TrackedPosition(subscription_id=theirs.id, coin="BTC", szi=9.0, entry_px=100.0),
        ])
        db.session.commit()
        mine_id = mine.id

    resp = _get(app)
    assert resp.status_code == 200
    assert sorted(resp.json, key=lambda p: p["coin"]) == [
        {"subscription_id": mine_id, "coin": "BTC", "szi": 0.5, "entry_px": 100.0},
        {"subscription_id": mine_id, "coin": "ETH", "szi": -2.0, "entry_px": 10.0},
    ]


def test_empty_when_no_copies(app):
    resp = _get(app)
    assert resp.status_code == 200 and resp.json == []


def test_requires_sign_in(app):
    assert app.test_client().get("/copy/positions").status_code == 401
