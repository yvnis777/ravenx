import os
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
# A fixed, test-only Fernet key
os.environ.setdefault("AGENT_KEY_ENCRYPTION_KEY", "dGVzdC1vbmx5LWtleS1kby1ub3QtdXNlLWFueXdoZXI=")
os.environ.setdefault("DISABLE_BACKGROUND_WORKERS", "1")


@pytest.fixture
def app():
    from app import create_app
    from extensions import db

    flask_app = create_app()
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    with flask_app.app_context():
        db.drop_all()
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def fake_hl_meta(monkeypatch):
    """Never fetch HL metadata in tests. BTC/ETH/DOGE mirror mainnet szDecimals."""
    from services import agent_service
    meta = {"universe": [
        {"name": "BTC", "szDecimals": 5},
        {"name": "ETH", "szDecimals": 4},
        {"name": "DOGE", "szDecimals": 0},
    ]}
    monkeypatch.setattr(agent_service, "_get_metas", lambda: (meta, {"universe": [], "tokens": []}))
