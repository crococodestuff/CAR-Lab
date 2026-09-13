from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock
import uuid
from .store import now

pool=ThreadPoolExecutor(max_workers=2)
lock=Lock(); tasks={}

def submit(key,fn):
    with lock:
        active=[t for t in tasks.values() if t['status'] in ('queued','running')]
        for t in active:
            if t['key']==key: return public(t)
        if len(active)>=4: raise ValueError('任务队列已满，请等待或取消')
        if len(tasks)>200:
            for tid in [tid for tid,t in tasks.items() if t['status'] not in ('queued','running')][:100]: tasks.pop(tid)
        task={'task_id':uuid.uuid4().hex,'key':key,'status':'queued','created_at':now(),'error':None,'result':None,'cancel':Event()}; tasks[task['task_id']]=task
    def work():
        task['status']='running'
        try:
            result=fn(task['cancel'])
            if task['cancel'].is_set(): raise InterruptedError('任务已取消')
            task['result']=result; task['status']='complete'
        except InterruptedError as exc: task['error']=str(exc); task['status']='cancelled'
        except Exception as exc: task['error']=f'{type(exc).__name__}: {exc}'; task['status']='failed'
    pool.submit(work)
    return public(task)

def public(t): return {k:v for k,v in t.items() if k not in ('cancel','key')}
