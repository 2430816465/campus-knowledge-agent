import pytest
from app.raster_ocr import positioned_blocks

QUAD = [[0, 1], [20, 1], [20, 9], [0, 9]]


def test_positions_preserve_separate_boxes_and_page_without_joining_dates():
    blocks, warnings = positioned_blocks([[QUAD, '2026年2月11日', .99], [QUAD, '3月20日16:00', .98]], 40, 20, '第 2 页 / ')
    assert len(blocks) == 2 and not warnings
    assert blocks[0][0] == '第 2 页 / OCR 框 1 / 置信度 0.990 xy=0,1;20,1;20,9;0,9'
    assert blocks[1][1] == '3月20日16:00'


@pytest.mark.parametrize('item', [[QUAD, '日期', .49], [QUAD, '日期', float('nan')],
    [[[0, 0], [999, 0], [20, 9], [0, 9]], '日期', .99],
    [[[0, 0], [float('inf'), 0], [20, 9], [0, 9]], '日期', .99],
    [QUAD, '', .99], [QUAD, '字' * 1001, .99], [[], '日期', .99], None])
def test_invalid_box_is_explicit_recoverable_gap(item):
    blocks, warnings = positioned_blocks([item], 40, 20)
    assert not blocks
    assert any('待 OCR' in w for w in warnings)


def test_box_limit_and_no_result_are_not_silent_success():
    blocks, warnings = positioned_blocks([[QUAD, '文字', .99]] * 1001, 40, 20)
    assert len(blocks) == 1000 and any('截断' in w for w in warnings)
    assert positioned_blocks(None, 40, 20)[1]
