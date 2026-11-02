"""Recreate file and database containers without deleting their named volumes."""
import hashlib
import json
import time
import urllib.error
import integration as api

status, login = api.request('/auth/login', 'POST', {'email': api.ENV['DEMO_EMAIL'], 'password': api.ENV['DEMO_PASSWORD']}, token='')
assert status == 200, status
api.TOKEN = login['accessToken']
status, history = api.request('/api/cargas?pageSize=100')
assert status == 200
load_id = next(row['id'] for row in history['items'] if row['status'] == 'Notificado')
status, data = api.request(f'/api/cargas/{load_id}/archivo')
assert status == 200
expected = hashlib.sha256(data).hexdigest()
api.compose('up', '-d', '--no-deps', '--force-recreate', 'seaweedfs', 'postgres')
deadline = time.monotonic()+75
while time.monotonic() < deadline:
    try:
        status, data = api.request(f'/api/cargas/{load_id}/archivo')
        if status == 200:
            assert hashlib.sha256(data).hexdigest() == expected, 'File hash changed after container recreation'
            break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(1)
else:
    raise AssertionError('File/database did not recover after container recreation')
result = api.request('/api/cargas/'+load_id)[1]
assert result['load']['status'] == 'Notificado'
report = {'passed': True, 'load_id': load_id, 'sha256': expected,
          'test': 'Recreate PostgreSQL and SeaweedFS containers; load history and original file survive with identical SHA-256'}
out = api.ROOT / 'artifacts' / 'persistence.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
