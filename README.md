# CAR Lab

脑氧与血压分析学习台：从原始观测、质量检查和时间平均，逐步理解滚动 COx、参数敏感性和探索性 MAPopt。

**在线学习：<https://crococodestuff.github.io/CAR-Lab/>**

## 在线版

GitHub Pages 提供静态页面；Pyodide 在浏览器工作线程中运行 `backend/car_core` 的同一 Python 内核。没有远程计算服务，不需要 API 密钥。

1. 首次打开需联网加载 Python、NumPy 和 pandas，页面显示加载进度。
2. 可直接进入“合成信号实验室”，或点击“选择病例 → 更新官方索引”，选择 VitalDB 公开病例并下载分析。
3. 按左侧七个步骤学习。严格质控没有合格窗口时显示 null，不要仅为获得结果放宽规则。
4. 数据、标记和已完成运行保存在**当前浏览器的 IndexedDB**，刷新恢复上次完成的学习步骤。不同设备不自动同步；隐私模式或清除网站数据可能丢失缓存，请导出报告。一个站点同时只允许一个标签页使用缓存。

网站不会上传观测、标记或计算结果。浏览器向 GitHub Pages 请求页面/内核，向 jsDelivr 请求 Pyodide 及科学计算包，向 VitalDB 请求公开数据；这些服务会接收常规网络请求信息。首次加载需要网络，未提供完整网站离线安装保证。

### 学习功能

- 原始图与紧凑观测表联动，支持记录分钟、时分秒、相对手术开始时间。公开数据不能恢复真实日期或当天时钟。
- 质控前 MAP、左右脑氧取值范围、均值、样本标准差卡片；可折叠 MAP 质控学习卡片。
- 质量色块显示观测数、支持覆盖、最长缺口和原因；点击定位原始记录并保留缩放。确认伪差后才人工排除。
- 时间平均与 COx 悬停同步高亮原始图表范围，查看精确输入和相关计算。
- MAP 原值、清洗值、质量标记同时保留；无效值设 NaN，不截断成正常范围。零值及极端值默认保留复核。
- A/B 对照、MAP 分箱及 **3、5、10、20、30、60、90、120 分钟** COx 的 MAPopt 二次拟合。左右侧独立；示意参考线默认 ±0.30，可配置。
- 导出 ZIP（HTML、CSV、清单、参数、标记）、MAP 质控 CSV、独立 MAPopt JSON。

## 本地运行

要求 Python 3.12、Node.js 22.12+、pnpm 11.19.0。Windows：

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

访问 <http://127.0.0.1:8765>。macOS/Linux 使用 `.venv/bin/python`，构建后执行：

```bash
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765
```

也可运行 `docker compose up --build -d`，仅绑定本机 8765。本地版在 `data/` 保存 CSV/Parquet/JSON；`CAR_DATA_DIR` 可修改目录，`.env.example` 不会被原生启动自动读取。本地前端无外部 CDN 依赖。

开发时运行本地 API，另在 `frontend` 执行 `pnpm dev`。CLI 示例：

```powershell
.\.venv\Scripts\python.exe -m backend.cli --refresh --screen 3
.\.venv\Scripts\python.exe -m backend.cli --case 251 --sensitivity --output data/demo-sensitivity
```

病例 251 是公开可复现的探索示例，候选名单仍动态生成。Notebook 位于 `notebooks/01_vitaldb_cox_walkthrough.ipynb`，提交版本不含执行输出。通用其他来源导入尚未开放，见 [多来源导入规划](docs/multi_source_import.md)。

## 构建与发布 Pages

```powershell
python scripts/build_browser.py
cd frontend
pnpm exec tsc --noEmit
pnpm exec vite build --mode pages
pnpm exec vite preview --mode pages --host 127.0.0.1 --port 4173
```

预览 <http://127.0.0.1:4173/CAR-Lab/>。输出 `frontend/dist-pages/`，不覆盖本地版 `frontend/dist/`。打包脚本只收录明确允许的 Python 源码，不读取本地数据或机器配置。

仓库 Pages 设置使用 **GitHub Actions**。推送 `main` 触发 `.github/workflows/pages.yml`，审查文件、构建、上传静态产物并部署，无需自建密钥。仓库改名时需同步 `frontend/vite.config.ts` 的路径。

## 验证与公开文件审查

```powershell
.\.venv\Scripts\python.exe -m pytest -q
python scripts/audit_public.py
cd frontend
pnpm exec tsc --noEmit
pnpm exec playwright test --config playwright.pages.config.ts
```

Pages 测试要求预览服务运行、Chrome 已安装且可访问 Pyodide/VitalDB。本地版 `pnpm test:e2e` 要求 8765 服务运行并已缓存公开病例 251；它添加后恢复测试标记。截图、日志和测试导出留在忽略的 `artifacts/` 或 `test-results/`。

审查脚本检查 Git 索引，拒绝本地数据、缓存、凭据文件、Notebook 输出、用户目录及常见令牌/私人邮件模式。自动扫描不能证明绝无隐私问题，发布仍需人工检查差异及提交身份；不要用强制添加绕过忽略规则。

## 方法与来源

详见 [计算契约](docs/methods.md) 与 [数据来源及许可](docs/data_sources.md)。VitalDB：Lee HC 等，Scientific Data 9,279 (2022)，DOI [10.1038/s41597-022-01411-5](https://doi.org/10.1038/s41597-022-01411-5)；公开数据 CC BY 4.0。网页与报告保留来源、许可及派生分析说明。

本工具用于成人公开数据教学。MAP 和 NIRS 不是直接脑血流，COx 为间接关联指标，重叠窗口不是独立样本。MAPopt 是观测范围内的探索估计，不输出 LLA/ULA、诊断、治疗目标或新生儿阈值。
