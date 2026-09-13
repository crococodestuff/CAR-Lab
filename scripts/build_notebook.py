from pathlib import Path
import sys
import nbformat as nbf

ROOT=Path(__file__).resolve().parents[1]
nb=nbf.v4.new_notebook()
md=nbf.v4.new_markdown_cell; code=nbf.v4.new_code_cell
nb.cells=[
md('# CAR Lab：一例真实记录的 COx 学习路径\n\n成人公开数据 · 教学用途。默认严格运行可能无有效窗口，这是应保留的结果。本笔记显式另建24/30探索运行，不能将其称为严格验证通过。所有正式计算复用 backend/car_core。'),
code("from pathlib import Path\nimport sys, json\nROOT = Path.cwd()\nif not (ROOT / 'backend').exists(): ROOT = ROOT.parent\nsys.path.insert(0, str(ROOT))\nfrom backend.app.services import vitaldb, runs\nfrom backend.car_core.config import AnalysisConfig\nfrom backend.car_core.analysis import explain_window\nfrom backend.app.services.export import export_zip\nfrom scipy.stats import pearsonr\nimport pandas as pd\nfrom IPython.display import display, HTML\n"),
md('## 1. 动态索引与真实来源\n首次执行会联网下载目录与所选数值通道；缓存后全部计算可以离线进行。示例病例251来自本次实际筛查，非算法硬编码。'),
code("if not vitaldb.list_cases(): vitaldb.refresh_catalog()\ncatalog = vitaldb.list_cases()\nprint('动态候选数:', len(catalog))\ncaseid = 251\nvitaldb.download_case(caseid)\ntracks, manifest = vitaldb.load_tracks(caseid)\ndisplay(pd.DataFrame([{k:manifest['case'].get(k) for k in ['caseid','age','opname','opstart','opend']}]))\ndisplay(pd.DataFrame({k:{'名义间隔':v['nominal_interval'], '实测间隔':v['interval_seconds'], 'SHA256':v['sha256']} for k,v in manifest['tracks'].items()}).T)"),
md('## 2. 原始时间戳\n不按行号合并，不把上一次值无限保持。观察脑氧约0.27s短间隔与约9.8s长间隔。'),
code("display(tracks['left'].head(12))\ndisplay(tracks['map'].head(12))"),
md('## 3. 严格时间块与窗口\n以病例0为锚点。下表包含均值、覆盖、最长未覆盖及原因。严格30/30不足时保留null。'),
code("strict = runs.run_analysis(caseid, AnalysisConfig())\ndisplay(pd.DataFrame(strict['summary']).T)\ndisplay(pd.json_normalize(strict['blocks'][200:205]))"),
md('## 4. 明确开启敏感性模式\n块覆盖门槛仍0.80；仅将固定300s窗口有效配对改为至少24/30。该运行是探索，不是默认结果。'),
code("exploratory = runs.run_analysis(caseid, AnalysisConfig(sensitivity=True, min_pair_ratio=.8))\ndisplay(pd.DataFrame(exploratory['summary']).T)\nw = next(w for w in exploratory['windows'] if w['side']=='left' and w['cox'] is not None)\nexplanation = explain_window(exploratory,w['window_id'])\nprint(explanation['interpretation'])\nprint({k:explanation[k] for k in ['start','end','cox','valid_pairs','sd_map','sd_rso2']})\npairs = pd.DataFrame(explanation['pairs'])\ndisplay(pairs)"),
md('## 5. 独立核验本窗口\nSciPy仅作为独立参考检查，正式结果始终来自同一内核。不要将相关值当作诊断。'),
code("valid = pairs[pairs.valid]\nreference = pearsonr(valid['map'], valid['rso2']).statistic\nprint('独立Pearson:',reference,'绝对误差:',abs(reference-w['cox']))\nassert abs(reference-w['cox']) < 1e-10\ndisplay(pd.DataFrame(exploratory['map_bins']))"),
md('## 6. 导出与复现\n离线报告内嵌SVG，CSV中的null留空，清单包含输入、参数、标记与代码哈希。'),
code("out = ROOT/'data'/'notebook-example.zip'\nout.write_bytes(export_zip(exploratory))\nprint(out)\nprint('run_id:',exploratory['run_id'])\nimport zipfile, io\nreport = zipfile.ZipFile(io.BytesIO(export_zip(exploratory))).read('report.html').decode()\ndisplay(HTML(report))"),
md('## 解释边界\nMAP不是脑血流，脑氧不是直接脑血流。氧合、通气、Hb、麻醉和氧耗均可能影响关系。成人公开数据不生成新生儿治疗阈值；输出高度重叠，不是独立样本，不计算点级p值。\n\n数据：Lee HC等，Scientific Data 9,279(2022)，DOI 10.1038/s41597-022-01411-5；CC BY4.0。方法参考：Vik等2026，DOI 10.1177/0271678X251406519。')]
nb.metadata={'kernelspec':{'display_name':'CAR Lab Python 3.12','language':'python','name':'python3'},'language_info':{'name':'python','version':'3.12'}}
path=ROOT/'notebooks'/'01_vitaldb_cox_walkthrough.ipynb';path.parent.mkdir(exist_ok=True)
if '--execute' in sys.argv:
    from nbclient import NotebookClient
    client=NotebookClient(nb,timeout=180,resources={'metadata':{'path':str(ROOT)}})
    client.create_kernel_manager()
    client.km.kernel_spec.argv=[sys.executable,'-m','ipykernel_launcher','-f','{connection_file}']
    client.execute()
nbf.write(nb,path)
print(path)
