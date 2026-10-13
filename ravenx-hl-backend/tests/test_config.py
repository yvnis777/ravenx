import pytest

from config import normalize_database_url


@pytest.mark.parametrize("raw, expected", [
    # Only psycopg 3 is installed; bare postgresql:// would load the absent psycopg2
    ("postgresql://u:p@localhost:5432/ravenx", "postgresql+psycopg://u:p@localhost:5432/ravenx"),
    ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("sqlite:///ravenx.db", "sqlite:///ravenx.db"),
])
def test_normalize_database_url(raw, expected):
    assert normalize_database_url(raw) == expected
