from io import BytesIO
from html import escape
import json
import zipfile
import importlib.metadata
import pandas as pd

LIMITS='成人公开数据用于学习，不能生成新生儿治疗阈值。MAP 与脑氧均不是直接脑血流。COx 是间接关联指标；氧合、CO2、Hb、麻醉及氧耗可能影响解释。重叠窗口不是独立样本；低变异、伪差和候选上限平台可能使结果失真。本报告仅包含基础COx结果；第7步的探索性MAPopt拟合报告需单独下载。本工具不输出LLA/ULA或临床建议。'

def svg_chart(windows):
    end=max((w['end'] for w in windows),default=1); paths=[]
    for side,color in [('left','#197b82'),('right','#97734b')]:
        segments=[]; current=[]
        for w in windows:
            if w['side']!=side: continue
            if w['cox'] is None:
                if current: segments.append(current); current=[]
            else: current.append(f'{50+w["end"]/end*850:.2f},{125-w["cox"]*85:.2f}')
        if current: segments.append(current)
        paths.extend(f'<polyline fill="none" stroke="{color}" stroke-width="1.4" points="{" ".join(s)}"/>' for s in segments)
    return '<svg viewBox="0 0 950 255" role="img" aria-label="左右 COx 时间曲线"><path d="M50 30V215H920" fill="none" stroke="#667"/><text x="10" y="40">+1</text><text x="20" y="130">0</text><text x="10" y="215">−1</text>'+''.join(paths)+f'<text x="50" y="245">病例起点后秒数 0–{end:g}；左侧实线（青）／右侧实线（棕）；缺口为 null</text></svg>'

def export_zip(result, quality_csv=None, versions=None):
    buf=BytesIO()
    versions=versions or {p:importlib.metadata.version(p) for p in ('numpy','pandas')}
    manifest={**result['manifest'],**{k:result[k] for k in ('run_id','input_hash','annotation_hash','config_hash','code_version','algorithm_version','created_at','mode')},'metadata_hash':result.get('metadata_hash'),'dependencies':versions,'map_quality':result.get('map_quality')}
    case=result['manifest']['case']
    report=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CAR Lab 学习报告</title><style>body{{font:16px system-ui;max-width:1100px;margin:40px auto;color:#243b44;padding:24px}}pre{{white-space:pre-wrap;background:#f2f5f6;padding:16px}}table{{border-collapse:collapse}}td,th{{border:1px solid #ccd;padding:8px}}svg{{width:100%}}</style><h1>CAR Lab · 脑氧与血压分析学习报告</h1><p>{escape(str(case.get('population')))} · case {escape(str(case.get('caseid')))} · 年龄 {escape(str(case.get('age') if case.get('age') is not None else '未知'))} 岁</p><p>术式：{escape(str(case.get('opname') or '未知'))}；范围 {result['range']['start']}–{result['range']['end']} 秒；左右侧独立</p>{svg_chart(result['windows'])}<h2>质量与有效时长（秒）</h2><pre>{escape(json.dumps(result['summary'],ensure_ascii=False,indent=2))}</pre><h2>参数</h2><p>10 秒平均、300 秒窗口借鉴 Vik 等方法；覆盖 0.80、严格 N/N、步长与低变异提示均为工程默认。参考线是探索参考值，非诊断阈值。null 在 CSV 中留空。</p><pre>{escape(json.dumps(result['config'],ensure_ascii=False,indent=2))}</pre><h2>方法与局限</h2><p>按 t=0 锚点半开时间块计算观测算术平均；不插值。支持区间只用于覆盖判断。Pearson = Σ(x−x̄)(y−ȳ) / √[Σ(x−x̄)²Σ(y−ȳ)²]。每个输出仅代表其右端之前一个步长，时长不累加完整滚动窗口。</p><p>{LIMITS}</p><h2>可追溯清单</h2><pre>{escape(json.dumps(manifest,ensure_ascii=False,indent=2))}</pre><h2>引用与许可</h2><p>Lee HC 等. VitalDB. Scientific Data 9,279 (2022). DOI: 10.1038/s41597-022-01411-5。数据 CC BY 4.0；本报告为派生教学分析。</p><p><a href="https://vitaldb.net/dataset/?query=api">VitalDB API</a> · <a href="https://physionet.org/content/vitaldb/1.0.0/">数据许可</a> · <a href="https://journals.sagepub.com/doi/10.1177/0271678X251406519">Vik 等 2026</a></p></html>'''
    blocks=[]
    for b in result['blocks']:
        row={'start':b['start'],'end':b['end']}
        for ch in ('map','left','right'):
            row.update({f'{ch}_{k}':'|'.join(v) if isinstance(v,list) else v for k,v in b[ch].items() if k not in ('start','end')})
        blocks.append(row)
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        if 'quality_comparison' in result:
            z.writestr('quality_comparison.json',json.dumps(result['quality_comparison'],ensure_ascii=False,indent=2,allow_nan=False))
        z.writestr('report.html',report)
        if quality_csv is not None: z.writestr('map_quality.csv',quality_csv)
        for name,value in [('config',result['config']),('manifest',manifest),('annotations',result['annotations'])]: z.writestr(name+'.json',json.dumps(value,ensure_ascii=False,indent=2))
        for name,rows in [('blocks',blocks),('cox_windows',result['windows']),('map_bins',result['map_bins'])]:
            frame=pd.DataFrame(rows)
            if name=='map_bins' and frame.empty:
                frame=pd.DataFrame(columns=['side','map_low','map_high','mean_cox','median_cox','outputs','support_seconds','observed_map_min','observed_map_max','low_coverage'])
            z.writestr(name+'.csv',frame.to_csv(index=False,na_rep='').encode('utf-8-sig'))
    return buf.getvalue()
