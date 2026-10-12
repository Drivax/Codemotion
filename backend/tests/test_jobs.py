import time
from fastapi.testclient import TestClient
from app.main import app


def wait(client, job):
    for _ in range(100):
        state = client.get('/api/jobs/' + job['id']).json()
        if state['status'] not in {'queued', 'running'}:
            return state
        time.sleep(0.05)
    raise AssertionError('job did not finish')


def test_real_worker_import_and_snapshot_cache():
    with TestClient(app) as client:
        payload = {'name': 'job-test', 'files': {'job_test.py': 'def square(x): return x*x'}}
        response = client.post('/api/repositories/import', json=payload)
        assert response.status_code == 202
        first = wait(client, response.json())
        assert first['status'] == 'completed', first
        root = '/api/repositories/' + first['repository_id']
        assert client.get(root).json()['repository']['name'] == 'job-test'
        function = next(n for n in client.get(root + '/symbols').json()['items'] if n['kind'] == 'Function')
        assert client.get(root + '/flows/' + function['id']).status_code == 200
        second = wait(client, client.post('/api/repositories/import', json=payload).json())
        assert second['repository_id'] == first['repository_id']
        assert second['progress'] == 'Snapshot cache hit'


def test_cancel_job_is_terminal():
    with TestClient(app) as client:
        payload = {'files': {f'module_{i}.py': 'def f(x):\n return x+1' for i in range(200)}}
        response = client.post('/api/repositories/import', json=payload)
        assert response.status_code == 202
        job = response.json()
        state = client.delete('/api/jobs/' + job['id']).json()
        assert state['status'] == 'cancelled'
        time.sleep(0.2)
        assert client.get('/api/jobs/' + job['id']).json()['status'] == 'cancelled'


def test_oversized_body_and_missing_resources():
    with TestClient(app) as client:
        assert client.post('/api/repositories/import', content='{}', headers={'Content-Length': '999999999'}).status_code == 413
        assert client.get('/api/jobs/nonexistent').status_code == 404
        assert client.get('/api/repositories/nonexistent').status_code == 404
        assert client.post('/api/examples/../../etc').status_code == 404
