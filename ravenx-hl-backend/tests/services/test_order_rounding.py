import pytest

from services.copy_service import _round_px, _round_sz


def test_long_limit_rounds_down_to_5_sig_figs():
    # DOGE (szDecimals 0) allows 6 decimals, so the 5-sig-fig rule binds:
    # 99.833333 → 99.833, rounded DOWN so the follower's entry stays <= target's
    assert _round_px("DOGE", 99.833333, is_long=True) == 99.833


def test_short_limit_rounds_up():
    assert _round_px("DOGE", 99.833333, is_long=False) == 99.834


def test_btc_price_has_one_decimal():
    # BTC: 6 - 5 = 1 max decimal
    assert _round_px("BTC", 99.87, is_long=True) == 99.8


def test_price_decimals_capped_by_sz_decimals():
    # ETH: 6 - 4 = 2 max decimals; 5 sig figs leaves only 1 here
    assert _round_px("ETH", 2345.6789, is_long=True) == 2345.6
    assert _round_px("ETH", 2345.6789, is_long=False) == 2345.7


def test_large_integer_price_is_allowed():
    assert _round_px("BTC", 123456.7, is_long=True) == 123456


def test_size_rounds_toward_zero_to_lot():
    assert _round_sz("ETH", 1.234567) == 1.2345
    assert _round_sz("DOGE", 0.4) == 0.0
    assert _round_sz("BTC", 0.000019) == 0.00001


def test_unknown_coin_raises():
    with pytest.raises(KeyError):
        _round_sz("NOPE", 1.0)
