from dataclasses import asdict, dataclass
import math


@dataclass(frozen=True)
class AnalysisConfig:
    block_seconds: int = 10
    window_seconds: int = 300
    step_seconds: int = 10
    min_block_coverage: float = .8
    sensitivity: bool = False
    min_pair_ratio: float = .8
    start: float = 0
    end: float | None = None
    sides: tuple = ('left', 'right')
    map_bin_width: int = 5
    reference: float | None = None
    use_annotations: bool = True
    ceiling_hint: bool = True
    ceiling_value: float = 95
    exclude_suspect: bool = False
    jump_map: float = 30
    jump_rso2: float = 15
    numerical_sd_tolerance: float = 1e-10
    low_sd_map: float = 1
    low_sd_rso2: float = .5
    map_quality_enabled: bool = True
    map_review_low: float = 20
    map_review_high: float = 200
    map_error_codes: tuple = ()

    def __post_init__(self):
        for name in ('block_seconds', 'window_seconds', 'step_seconds'):
            v = getattr(self, name)
            if type(v) is not int or v < 1:
                raise ValueError(f'{name} 必须是正整数')
        if self.window_seconds % self.block_seconds or self.step_seconds % self.block_seconds:
            raise ValueError('窗口和步长必须是分块长度的整数倍')
        if not 2 <= self.window_seconds / self.block_seconds <= 7200 or self.window_seconds > 7200:
            raise ValueError('窗口需包含 2–7200 块且不超过 7200 秒（120分钟）')
        if self.step_seconds > self.window_seconds:
            raise ValueError('步长不能超过窗口')
        if not 0 < self.min_block_coverage <= 1 or not 0 < self.min_pair_ratio <= 1:
            raise ValueError('质量比例必须在 (0,1]')
        if not math.isfinite(self.start) or self.start < 0 or (self.end is not None and (not math.isfinite(self.end) or self.end <= self.start)):
            raise ValueError('分析时间范围无效')
        if self.map_bin_width not in (2, 5, 10) or not self.sides or not set(self.sides) <= {'left', 'right'}:
            raise ValueError('分层宽度或侧别无效')
        if self.reference is not None and not -1 <= self.reference <= 1:
            raise ValueError('参考值需在 [-1,1]')
        for name in ('jump_map','jump_rso2','numerical_sd_tolerance','low_sd_map','low_sd_rso2'):
            if not math.isfinite(getattr(self, name)) or getattr(self, name) <= 0:
                raise ValueError(f'{name} 必须为有限正数')
        if not math.isfinite(self.ceiling_value):
            raise ValueError('候选上限必须有限')
        if type(self.map_quality_enabled) is not bool:
            raise ValueError('MAP质控开关必须是布尔值')
        if not all(math.isfinite(v) for v in (self.map_review_low, self.map_review_high)) or not 0 < self.map_review_low < self.map_review_high:
            raise ValueError('MAP复核界限必须满足 0 < 下限 < 上限')
        if not isinstance(self.map_error_codes, (list, tuple)) or len(self.map_error_codes) > 100 or any(type(v) not in (int, float) or not math.isfinite(v) for v in self.map_error_codes):
            raise ValueError('设备错误码必须是最多100个有限数值')

    @classmethod
    def from_saved(cls, values):
        # Preserve the policy used to create historical frozen blocks.
        return cls(**{'map_quality_enabled': False, **values})

    @property
    def required_pairs(self):
        n = self.window_seconds // self.block_seconds
        return max(2, math.ceil(n * self.min_pair_ratio)) if self.sensitivity else n

    def to_dict(self):
        return asdict(self)
