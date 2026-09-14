import {type Config} from './types';
import {coxWindowLabel} from './windowOptions';

export function ParameterGuide({config}:{config:Config}){
 const count=config.window_seconds/config.block_seconds;
 const compatible=Number.isInteger(count)&&count>=2&&count<=7200&&config.block_seconds>0&&Number.isInteger(config.block_seconds)&&config.step_seconds>0&&Number.isInteger(config.step_seconds)&&config.step_seconds%config.block_seconds===0&&config.step_seconds<=config.window_seconds;
 const required=config.sensitivity?Math.max(2,Math.ceil(count*config.min_pair_ratio)):count;
 return <details className="parameter-guide" data-testid="parameter-guide">
  <summary>参数怎么影响计算？查看时间示意图与逐项解释</summary>
  <svg viewBox="0 0 820 230" role="img" aria-label="平均块、COx窗口与输出步长的关系示意图">
   <rect x="0" y="0" width="820" height="230" rx="8" fill="#f3f8f8"/>
   <g fontSize="14" fill="#325c68">
    <text x="22" y="28">① 原始观测 → 每 {config.block_seconds} 秒取合格点的均值</text>
    {Array.from({length:10},(_,i)=><rect key={i} x={24+i*75} y="42" width="69" height="24" rx="3" fill={i%2?'#dcebea':'#bcdcd8'}/>)}
    <text x="22" y="93">② COx 窗口：{coxWindowLabel(config.window_seconds)}，含 {Number.isFinite(count)?Number(count.toFixed(2)):'—'} 个时间块</text>
    <rect x="24" y="104" width="620" height="27" rx="4" fill="#367d86"/>
    <text x="38" y="123" fill="white">窗口一：用 MAP 块均值与该侧脑氧块均值计算 Pearson 相关</text>
    <rect x="110" y="143" width="620" height="27" rx="4" fill="#6484aa"/>
    <text x="124" y="162" fill="white">窗口二：时间向前推进 {config.step_seconds} 秒，再计算一次 COx</text>
    <text x="22" y="202">③ 输出步长 = {config.step_seconds} 秒；每个点向后看 {coxWindowLabel(config.window_seconds)}</text>
    <text x="22" y="222" fontSize="11" fill="#69848c">结构示意，不按时间比例绘制；方块省略了中间数量。窗口不足或不满足配对条件时显示 null。</text>
   </g>
  </svg>
  <p>{compatible?`当前组合：每窗 ${count} 块，至少需要 ${required} 个合格 MAP–脑氧配对；${config.sensitivity?'放宽模式仍保留固定时间窗口及缺口。':'严格模式要求全部配对合格。'}`:'当前时间组合不兼容：窗口和步长须为块长的整数倍，窗口至少含 2 块，步长不能大于窗口。请调整后计算。'}</p>
  <div className="parameter-explanations">
   <div><h3>平均块 / s</h3><p>按记录起点固定分块，例如 [0,10)、[10,20) 秒。只平均块内合格原始观测；不插值、不按行号拼接。块越长，细节被汇总得越多。</p></div>
   <div><h3>COx 计算窗口 / 分钟</h3><p>每次相关计算向后覆盖多久。5 分钟配合 10 秒块得到 30 对候选均值；120 分钟得到 720 对。长窗口需要更长完整历史。主分析与 MAPopt 选项一致，MAPopt 可独立切换以比较窗口影响。</p></div>
   <div><h3>步长 / s</h3><p>相邻 COx 输出的时间间隔，不是原始采样间隔。窗口 300 秒、步长 10 秒时，每 10 秒输出一次，相邻窗口重叠 290 秒；点数不能当作独立样本数。</p></div>
   <div><h3>块最低覆盖率</h3><p>合格观测能够支持的时长占块长的比例。0.8 表示 80%；10 秒块至少需 8 秒有效支持。此外仍需有合格观测、无超限连续缺口且完整位于分析范围内，不能只看点数。</p></div>
   <div><h3>配对模式与放宽配对比例</h3><p>配对是同一时间块的 MAP 与一侧脑氧都合格。严格模式要求 N/N；放宽模式要求至少 max(2, 向上取整(N×比例)) 对。比例 0.8、N=30 时需 24 对。只在放宽模式下使用该比例，窗口时间不压缩。</p></div>
   <div><h3>分析起点 / 终点</h3><p>单位始终是从记录开始经过的秒数，不跟随图表显示单位。终点留空用完整记录。只分析选定区间；起点后重新等待完整窗口，不借用起点之前的数据，固定块网格仍锚定记录起点。</p></div>
   <div><h3>MAP 分箱 / mmHg</h3><p>把同窗平均 MAP 按 2、5 或 10 mmHg 分组，汇总 COx。例如 5 mmHg 箱为 [60,65)、[65,70)。不改变 COx；MAPopt 的逐窗口拟合中只影响分箱显示，分箱均值拟合中会改变拟合输入。</p></div>
   <div><h3>探索参考值</h3><p>用于 COx 图上的参考线，以及高于该值的有效支持时长比例；不参与质控或 Pearson 计算。MAPopt 页的两条示意线独立配置，均不自动定义治疗目标。</p></div>
   <div><h3>应用人工排除</h3><p>计算时将已保存标记的 [起点,终点) 从受影响通道排除，同时扣除其时间支持。关闭后本次计算忽略这些标记，标记本身与原始记录仍保留。</p></div>
   <div><h3>提示 INVOS 候选上限</h3><p>脑氧 ≥{config.ceiling_value}% 时标为候选上限，默认只是提示；不能仅凭平台认定设备截断。是否排除还取决于独立的 NIRS 范围规则及可疑点开关。</p></div>
   <div><h3>自动排除可疑点（探索规则）</h3><p>启用后排除可疑跳变、候选上限和极端百分值提示点。当前跳变提示为相邻 MAP 差 &gt;{config.jump_map} mmHg、脑氧差 &gt;{config.jump_rso2} 百分点。平坦提示本身不删除；MAP 零值/高低值复核本身也不删除。修改后需重算。</p></div>
  </div>
 </details>;
}
