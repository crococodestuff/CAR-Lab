# 数据来源、许可与真实筛查

核验日期：2026-09-13。只访问官方固定端点，不接受任意下载 URL。

| 来源 | 用途 |
|---|---|
| [VitalDB overview](https://vitaldb.net/dataset/?query=overview) | 6388例、通道字典、Solar8000 2s / INVOS 5s 名义间隔 |
| [VitalDB API](https://vitaldb.net/dataset/?query=api) | cases/trks/单轨道CSV；共同病例起点，数值缺失行省略 |
| [PhysioNet v1.0.0](https://physionet.org/content/vitaldb/1.0.0/) | 数据文件 CC BY 4.0，署名要求 |
| [Lee 等 2022](https://doi.org/10.1038/s41597-022-01411-5) | VitalDB 数据引用：Scientific Data 9,279 |
| [Vik 等 2026](https://journals.sagepub.com/doi/10.1177/0271678X251406519) | 时间域 COx 方法参考、INVOS95平台局限 |

本应用将上游公开数据转为规范数值副本、时间块及派生报告。保留 Lee 等署名、来源链接、许可链接及修改说明。成人公开病例用于教学，不做新生儿病例包装。

| 标准键 | 原始轨道 | 单位 | 默认下载 |
|---|---|---|---|
| map | Solar8000/ART_MBP | mmHg | 是 |
| left | Invos/SCO2_L | % | 存在则下载 |
| right | Invos/SCO2_R | % | 存在则下载 |
| etco2 | Solar8000/ETCO2 | mmHg | 手动辅助开关 |
| spo2 | Solar8000/PLETH_SPO2 | % | 手动辅助开关 |
| hr | Solar8000/HR | bpm | 手动辅助开关 |

未接入 labs。年龄、术式、手术/麻醉时间按原始元数据展示；缺失写未知。

公开数据的记录日期和当天时钟已去标识化，所有时间以记录开始为0秒，不能恢复实际几点几分（见[Lee等原始研究的去标识化与Data Records章节](https://www.nature.com/articles/s41597-022-01411-5)）。页面提供分钟、记录经过时:分:秒、相对手术开始时:分:秒三种显示；没有手术起点时禁用该选项。相对手术显示仅对标签减去opstart，保留负值与超过24小时的经过时长，不改变分块锚点或导出秒数。

## 目录与缓存

候选病例通过实时目录中 MAP 与至少一侧脑氧轨道的交集生成。页面显示当前索引的候选数与获取时间；通道存在不代表质量合格。按严格完整配对可能没有可计算窗口，必须保留 null 与拒绝原因；探索参数需显式开启。

本地版保存原始 CSV、规范 Parquet 和来源清单。浏览器版将原始 CSV、清单、标记与运行保存在 IndexedDB，读取时由同一规范化函数转换，不依赖 Parquet。两种模式均保留来源 URL、时间、SHA256 与实测间隔，原始数据不随网站发布。
