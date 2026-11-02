"""Measured synthetic import. Creates data; does not reset the database."""
import argparse
import json
import platform
import time
import uuid
from pathlib import Path
import integration as api

parser = argparse.ArgumentParser()
parser.add_argument('--rows', type=int, default=10000)
args = parser.parse_args()
if not 1 <= args.rows <= 50000:
    parser.error('--rows must be between 1 and 50000')
status, response = api.request('/auth/login', 'POST', {'email': api.ENV['DEMO_EMAIL'], 'password': api.ENV['DEMO_PASSWORD']}, token='')
assert status == 200, status
api.TOKEN = response['accessToken']
run = uuid.uuid4().hex[:12].upper()
year = 2100 + int(run[:4], 16) % 7800
data = api.fixture([[f'{year}-12', f'BENCH-{run}-{i:05}', f'Product {i}', '10.25'] for i in range(args.rows)])
start = time.monotonic()
load_id = api.upload(data)
accepted = time.monotonic()
result = api.wait_load(load_id, timeout=180)
end = time.monotonic()
assert result['load']['inserted'] == args.rows, result
report = {'load_id': load_id, 'rows': args.rows, 'xlsx_bytes': len(data), 'upload_acceptance_seconds': round(accepted-start, 3),
          'end_to_end_seconds': round(end-start, 3), 'rows_per_second_end_to_end': round(args.rows/(end-start), 1),
          'result': result['load'], 'note': f'Single run, host architecture {platform.machine()}, Docker; includes upload, queueing, processing and local SMTP. Not a production capacity guarantee.'}
out = api.ROOT / 'artifacts' / 'benchmark.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps({k: v for k, v in report.items() if k != 'result'}, indent=2))
