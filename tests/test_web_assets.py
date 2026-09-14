import pytest
from scripts.build_web_assets import validate_numeric_track


def test_public_track_allowlist_preserves_invalid_numeric_values():
    raw = b'Time,Invos/SCO2_L\n1.23,NaN\n9,Inf\n10,\n'
    validate_numeric_track(raw, 'Invos/SCO2_L')
    assert raw == b'Time,Invos/SCO2_L\n1.23,NaN\n9,Inf\n10,\n'


@pytest.mark.parametrize('raw', [b'Time,Name\n0,70\n', b'Time,Invos/SCO2_L\n0,70,extra\n', b'Time,Invos/SCO2_L\n0,unexpected-text\n'])
def test_public_track_rejects_extra_fields_or_unexpected_text(raw):
    with pytest.raises(ValueError):
        validate_numeric_track(raw, 'Invos/SCO2_L')
