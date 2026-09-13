import time
from backend.app.services import tasks

def test_duplicate_bounded_task_and_cancel():
    first=tasks.submit('test-cancellation',lambda cancel:cancel.wait(5))
    second=tasks.submit('test-cancellation',lambda cancel:'should not execute')
    assert first['task_id']==second['task_id']
    task=tasks.tasks[first['task_id']]
    task['cancel'].set()
    deadline=time.monotonic()+2
    while task['status'] in ('queued','running') and time.monotonic()<deadline: time.sleep(.01)
    assert task['status']=='cancelled' and task['result'] is None
