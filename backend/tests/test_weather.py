from agents.weather import _clean_text


def test_clean_text_repairs_utf8_mojibake():
    assert _clean_text("Äa Kao") == "Đa Kao"


def test_clean_text_preserves_valid_unicode():
    assert _clean_text("Hồ Chí Minh") == "Hồ Chí Minh"