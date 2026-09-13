# CAR Lab

CAR Lab 是脑氧与血压分析学习工具，支持本地 Python 服务与 GitHub Pages 浏览器计算。成人公开数据和合成实验必须明确区分，不提供临床治疗目标。

- `backend/car_core` 是唯一正式计算实现；API、CLI、Notebook 与 Pyodide 复用它。按真实时间戳分块，保留缺口，左右质量独立；未定义相关返回 null。
- 计算变更参见 `docs/methods.md`；数据接入参见 `docs/data_sources.md`；部署参见 `README.md`。按任务需要读取。
- 原始数据不可覆写；标记、配置、源码参与运行指纹。不要提交 `data/`、浏览器缓存、个人路径、凭据、Notebook 输出、截图或内部工作记录。
- 按改动风险验证。发布前审查全部待推送文件及提交身份，运行 `scripts/audit_public.py`。不要在日志中打印凭据。
- 外部发布需有用户授权；获授权后完成构建、验证与部署。本项目不使用 AI API，不混入其他项目数据。
- Pages 仅上传 `frontend/dist-pages`；Python 打包脚本只收录明确列出的源码。浏览器数据仅持久化于当前站点的 IndexedDB。

编写参考：[OpenAI：Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)。
