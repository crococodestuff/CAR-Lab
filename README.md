<div align="center">

# CAR Lab

**从脑氧与血压信号出发，逐步理解脑血流自动调节分析。**

原始信号 · 质量检查 · 滚动 COx · 参数对照 · 探索性 MAPopt

[**打开在线学习台 →**](https://crococodestuff.github.io/CAR-Lab/)

[快速开始](#快速开始) · [本地运行](#本地运行) · [方法说明](docs/methods.md) · [数据来源](docs/data_sources.md)

</div>

---

CAR Lab 是一个交互式脑氧与血压分析学习工具。你可以从一段原始记录开始，检查数据质量、追踪每个时间平均点和相关窗口的输入，再比较不同参数如何影响结果。

项目提供两种学习材料：**VitalDB 成人公开病例**用于观察真实记录中的变化与缺失，**合成信号实验室**用于探索可控信号下的方法表现。两类材料在应用中分别呈现。

## 可以做什么

| 学习环节 | 交互与分析 |
| --- | --- |
| 观察原始信号 | 联动查看平均动脉压（MAP）、左右脑氧曲线和观测表，缩放定位具体记录 |
| 检查数据质量 | 预览 MAP 与 NIRS 异常数量，调整质量规则，对照处理前后的统计与有效时长，回到原始信号核对并添加排除标记 |
| 理解时间平均 | 展开一个时间块，查看参与计算的观测、均值及合格情况 |
| 拆解滚动 COx | 查看单个窗口的配对数据、散点与相关计算，再将窗口放回整段趋势 |
| 对比参数 | 保存运行 A / B，在共同有效时间上比较窗口长度、质量规则与标记的影响 |
| 探索 MAPopt | 按 MAP 分箱，比较多种 COx 窗口下的二次拟合，左右侧分别分析 |
| 保存学习成果 | 导出包含 HTML 报告、CSV、参数和标记的 ZIP，或单独导出 MAP 质控 CSV、MAPopt JSON |

MAPopt 分析支持 **3、5、10、20、30、60、90、120 分钟**窗口。图表支持记录分钟、经过时分秒及相对手术开始时间；公开数据的时间显示以去标识化记录为基础。

## 快速开始

1. 打开 [CAR Lab 在线学习台](https://crococodestuff.github.io/CAR-Lab/)，等待首次运行环境加载完成。
2. 进入 **合成信号实验室**体验方法，或点击 **选择病例 → 更新官方索引**，下载一例 VitalDB 公开病例。
3. 沿左侧七个步骤，从原始信号依次进入质量检查、时间平均、COx、参数对比与 MAPopt。
4. 完成分析后导出报告，保存结果及对应的参数、标记。

> 某些记录在当前质量规则下可能没有合格窗口。此时显示 `null`，表示结果不可计算；可以展开窗口查看具体原因。

### 浏览器中的计算与存储

在线版无需安装软件或配置 API 密钥。Python 计算通过 Pyodide 在浏览器工作线程中完成，与本地版共用同一分析内核。

- **数据保存在当前浏览器。** 病例、标记和已完成运行存入当前站点的 IndexedDB，刷新后可恢复学习进度；不同设备之间不自动同步。
- **及时导出需要保留的结果。** 清除网站数据或使用隐私模式可能导致缓存丢失。同一站点请使用一个标签页进行分析。
- **首次使用需要联网。** 页面来自 GitHub Pages，运行环境来自 jsDelivr，公开病例来自 VitalDB。这些服务接收常规网络请求信息；观测、标记和计算结果不会上传到远程计算服务。

## 本地运行

本地版提供 Python 服务、命令行和 Notebook，适合希望在本机保存分析文件或进一步阅读计算过程的用户。

准备 **Python 3.12、Node.js 22.12+ 和 pnpm 11.19.0**，然后克隆仓库：

```bash
git clone https://github.com/crococodestuff/CAR-Lab.git
cd CAR-Lab
```

<details open>
<summary><strong>Windows / PowerShell</strong></summary>

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
corepack enable
corepack prepare pnpm@11.19.0 --activate
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ..
.\start.ps1
```

</details>

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
corepack enable
corepack prepare pnpm@11.19.0 --activate
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ..
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765
```

</details>

启动后访问 [本地学习台](http://127.0.0.1:8765)。也可在仓库根目录运行 `docker compose up --build -d`，通过相同地址访问。

本地分析文件默认保存在 `data/`，可通过环境变量 `CAR_DATA_DIR` 修改目录。原生启动不会自动读取 `.env.example`，使用自定义目录时需在启动前设置环境变量。

### 命令行与 Notebook

下面的 PowerShell 示例分别更新并筛查公开病例，以及对病例 251 进行参数敏感性分析：

```powershell
.\.venv\Scripts\python.exe -m backend.cli --refresh --screen 3
.\.venv\Scripts\python.exe -m backend.cli --case 251 --sensitivity --output data/demo-sensitivity
```

macOS / Linux 将 Python 路径替换为 `.venv/bin/python`。完整的分步示例见 [VitalDB COx 分析 Notebook](notebooks/01_vitaldb_cox_walkthrough.ipynb)。病例候选名单根据官方索引动态生成，其他来源的通用导入见 [多来源导入规划](docs/multi_source_import.md)。

## 开发与部署

应用使用 **React、TypeScript 和 ECharts** 构建界面，**Python** 实现分析。API、CLI、Notebook 和浏览器版复用 `backend/car_core`。

开发前端时，先启动本地 API，再在 `frontend` 目录运行 `pnpm dev`。

<details>
<summary><strong>构建 GitHub Pages 版本</strong></summary>

完成上述依赖安装后，在仓库根目录运行（`python` 需指向 Python 3.12）：

```powershell
python scripts/build_browser.py
cd frontend
pnpm exec tsc --noEmit
pnpm exec vite build --mode pages
pnpm exec vite preview --mode pages --host 127.0.0.1 --port 4173
```

访问 [Pages 本地预览](http://127.0.0.1:4173/CAR-Lab/)。静态产物位于 `frontend/dist-pages/`；本地服务版产物位于 `frontend/dist/`。

仓库的 Pages 发布源设为 **GitHub Actions** 后，推送 `main` 会触发 [部署工作流](.github/workflows/pages.yml)。Fork 或更改仓库名称时，请同步调整 `frontend/vite.config.ts` 中的站点路径。

</details>

<details>
<summary><strong>运行测试</strong></summary>

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd frontend
pnpm exec tsc --noEmit
pnpm exec playwright test --config playwright.pages.config.ts
```

Pages 端到端测试需要运行预览服务、安装 Chrome，并能访问 Pyodide 和 VitalDB。本地版端到端测试使用 `pnpm test:e2e`，需要本地 8765 服务已启动并缓存公开病例 251。

</details>

## 方法与数据来源

CAR Lab 面向教学与方法探索，不用于临床决策。COx 描述窗口内 MAP 与脑氧的关联，MAPopt 是观测范围内的探索性估计；结果需结合数据质量和分析参数理解。计算定义与局限详见 [方法说明](docs/methods.md)。

真实病例来自 **VitalDB 成人公开数据集**，数据采用 **CC BY 4.0** 许可。应用和导出报告保留数据来源、许可及派生分析说明，详见 [数据来源与许可](docs/data_sources.md)。

> Lee HC et al. *VitalDB, a high-fidelity multi-parameter vital signs database in surgical patients.* Scientific Data **9**, 279 (2022). [doi:10.1038/s41597-022-01411-5](https://doi.org/10.1038/s41597-022-01411-5)
