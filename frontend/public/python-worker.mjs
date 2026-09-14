// Scientific code is shipped from backend/car_core by scripts/build_browser.py.
import {WorkingFiles,readJSON,downloadCatalog,writeFiles,encodeJSON} from './browser-storage.mjs';
let runtime, working, catalog, ready=false, stage='准备计算环境';
const progress = message => {stage=message;postMessage({progress:message});};
const warning = message => postMessage({progress:message,storageWarning:true});
async function initialize(temporary,suppliedCatalog) {
  progress('加载本站 Python 运行环境；首次启动较慢');
  const {loadPyodide}=await import('./pyodide/pyodide.mjs');
  const py=await loadPyodide({indexURL:new URL('./pyodide/',import.meta.url).href});
  progress('加载 NumPy / pandas 计算组件');
  await py.loadPackage(['numpy','pandas']);
  const response = await fetch(new URL('python-core.zip', import.meta.url));
  if (!response.ok) throw new Error('计算内核下载失败，请刷新重试');
  const bytes = await response.arrayBuffer();
  const manifest = await (await fetch(new URL('python-build.json', import.meta.url))).json();
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== manifest.archive_sha256) throw new Error('计算内核版本校验失败，请刷新页面');
  py.unpackArchive(bytes, 'zip', {extractDir: '/app'});
  py.FS.mkdirTree('/car-data');
  working=new WorkingFiles(py,{temporary,onWarning:warning});
  catalog=suppliedCatalog??await readJSON('/car-data/catalog/current.json').catch(()=>null)??await downloadCatalog(new URL('./',import.meta.url));
  if(!catalog.public_track_files)catalog=await downloadCatalog(new URL('./',import.meta.url));
  if(!temporary)await writeFiles([['/car-data/catalog/current.json',encodeJSON(catalog)]]).catch(e=>warning(e.message));
  await py.runPythonAsync("import sys\nsys.path.insert(0, '/app')\nfrom backend.browser_api import dispatch_json");
  ready=true;progress(temporary?'计算内核就绪 · 临时模式，关闭前请导出':'计算内核就绪 · 按需读取当前病例');
  return py;
}
// One Python interpreter, one request at a time; cancellation terminates this worker.
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    try {
      const py = await (runtime ??= initialize(!!data.request.temporary,data.catalog));
      catalog=data.catalog??catalog;
      await working.prepare(data.request,catalog);
      py.globals.set('_car_request_json', JSON.stringify(data.request));
      const result = JSON.parse(await py.runPythonAsync('await dispatch_json(_car_request_json)'));
      await working.commit();
      postMessage({id: data.id, result});
    } catch (error) {
      // Hide Python tracebacks and internal filesystem paths in the learning UI.
      const lines = String(error?.message || error).trim().split('\n');
      const message=lines.at(-1).replace(/^(ValueError|TypeError|KeyError): /, '');
      postMessage({id:data.id,error:ready?message:`${stage}失败：${message}。可重启计算环境后重试。`,fatal:!ready});
    }
  });
};
