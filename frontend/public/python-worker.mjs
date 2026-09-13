// Scientific code is shipped from backend/car_core by scripts/build_browser.py.
import {loadPyodide} from 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs';
let runtime;
const progress = message => postMessage({progress: message});
const sync = (py, populate) => new Promise((resolve, reject) => py.FS.syncfs(populate, error => error ? reject(new Error('浏览器缓存不可用或空间不足，请检查网站存储权限')) : resolve()));
async function initialize() {
  progress('首次加载 Python 运行环境，取决于网络速度');
  const py = await loadPyodide({indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/'});
  progress('加载 NumPy / pandas 计算组件');
  await py.loadPackage(['numpy', 'pandas']);
  const response = await fetch(new URL('python-core.zip', import.meta.url));
  if (!response.ok) throw new Error('计算内核下载失败，请刷新重试');
  const bytes = await response.arrayBuffer();
  const manifest = await (await fetch(new URL('python-build.json', import.meta.url))).json();
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== manifest.archive_sha256) throw new Error('计算内核版本校验失败，请刷新页面');
  py.unpackArchive(bytes, 'zip', {extractDir: '/app'});
  py.FS.mkdirTree('/car-data');
  py.FS.mount(py.FS.filesystems.IDBFS, {}, '/car-data');
  progress('恢复此浏览器保存的数据和分析');
  await sync(py, true);
  await py.runPythonAsync("import sys\nsys.path.insert(0, '/app')\nfrom backend.browser_api import dispatch_json");
  progress('计算内核就绪 · 数据保存在此浏览器');
  return py;
}
// One Python interpreter, one request at a time; cancellation terminates this worker.
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    try {
      const py = await (runtime ??= initialize().catch(error => { runtime = null; throw error; }));
      py.globals.set('_car_request_json', JSON.stringify(data.request));
      const result = JSON.parse(await py.runPythonAsync('await dispatch_json(_car_request_json)'));
      await sync(py, false);
      postMessage({id: data.id, result});
    } catch (error) {
      // Hide Python tracebacks and internal filesystem paths in the learning UI.
      const lines = String(error?.message || error).trim().split('\n');
      postMessage({id: data.id, error: lines.at(-1).replace(/^(ValueError|TypeError|KeyError): /, '')});
    }
  });
};
