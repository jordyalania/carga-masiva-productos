"""End-to-end acceptance tests against this project's real Compose services.

Uses only Python's standard library. Creates test loads; never deletes volumes.
--recovery additionally stops/recreates this project's workers, broker and SMTP.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / 'backend' / 'tests' / 'fixtures' / 'products.xlsx'
ENV_FILE = Path(os.environ.get('CARGAS_ENV_FILE', str(ROOT / '.env')))
ENV = dict(line.split('=', 1) for line in ENV_FILE.read_text().splitlines() if line and not line.startswith('#'))
BASE = 'http://127.0.0.1:' + ENV.get('API_PORT', '8080')
MAIL = 'http://127.0.0.1:' + ENV.get('MAIL_UI_PORT', '8025')
TOKEN = ''
EVIDENCE = []
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ET.register_namespace('', NS)


def check(name, condition, details=None):
    assert condition, f'{name}: {details}'
    entry = {'test': name, 'passed': True}
    if details is not None:
        entry['details'] = details
    EVIDENCE.append(entry)
    print('PASS:', name, flush=True)


def request(path, method='GET', body=None, content_type=None, token=None):
    headers = {}
    active = TOKEN if token is None else token
    if active:
        headers['Authorization'] = 'Bearer ' + active
    if content_type:
        headers['Content-Type'] = content_type
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            return response.status, json.loads(data) if 'json' in response.headers.get('Content-Type', '') else data
    except urllib.error.HTTPError as error:
        data = error.read()
        try:
            data = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            data = data.decode(errors='replace')
        return error.code, data


def upload(data, filename='products.xlsx', recipients=None, expected_status=202):
    boundary = '----test-' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    if recipients is not None:
        body = body.removesuffix(f'--{boundary}--\r\n'.encode()) + (f'--{boundary}\r\nContent-Disposition: form-data; name="recipients"\r\n\r\n{recipients}\r\n--{boundary}--\r\n').encode()
    status, result = request('/api/cargas', 'POST', body, 'multipart/form-data; boundary=' + boundary)
    assert status == expected_status, (status, result)
    return result.get('id')


def wait_load(load_id, statuses=('Notificado',), timeout=60):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        status, data = request('/api/cargas/' + load_id)
        assert status == 200, (status, data)
        if data['load']['status'] in statuses:
            return data
        if data['load']['status'] in ('Rechazado', 'Fallido') and data['load']['status'] not in statuses:
            raise AssertionError(data)
        time.sleep(.4)
    raise AssertionError(f'Timeout load {load_id}: {data}')


def fixture(rows, formula=False):
    sheet = ET.Element(f'{{{NS}}}worksheet')
    ET.SubElement(sheet, f'{{{NS}}}dimension', ref=f'A1:D{len(rows)+1}')
    data = ET.SubElement(sheet, f'{{{NS}}}sheetData')
    for number, values in enumerate([['Periodo', 'CodigoProducto', 'NombreProducto', 'Precio']] + rows, 1):
        row = ET.SubElement(data, f'{{{NS}}}row', r=str(number))
        for col, value in zip('ABCD', values):
            if value is None:
                continue
            cell = ET.SubElement(row, f'{{{NS}}}c', r=col+str(number), t='inlineStr')
            ET.SubElement(ET.SubElement(cell, f'{{{NS}}}is'), f'{{{NS}}}t').text = str(value)
        if formula and number == 2:
            cell = row[-1]
            cell.clear()
            cell.set('r', 'D2')
            ET.SubElement(cell, f'{{{NS}}}f').text = '1+1'
            ET.SubElement(cell, f'{{{NS}}}v').text = '2'
    output = io.BytesIO()
    with zipfile.ZipFile(SAMPLE) as original, zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as generated:
        for item in original.infolist():
            generated.writestr(item.filename, ET.tostring(sheet, encoding='utf-8') if item.filename == 'xl/worksheets/sheet1.xml' else original.read(item))
    return output.getvalue()


def compose(*args, env=None):
    return subprocess.check_output(['docker', 'compose', '--env-file', str(ENV_FILE), *args], cwd=ROOT, env=env, stderr=subprocess.STDOUT, text=True)


def sql(query):
    return compose('exec', '-T', 'postgres', 'psql', '-U', 'app', '-d', 'cargas', '-At', '-c', query).strip()


def forged_user_token():
    def encoded(obj):
        return base64.urlsafe_b64encode(json.dumps(obj, separators=(',', ':')).encode()).rstrip(b'=')
    header = encoded({'alg': 'HS256', 'typ': 'JWT'})
    claims = encoded({'iss': 'majestic-carga', 'aud': 'carga-api', 'sub': str(uuid.uuid4()), 'email': 'other@example.test', 'exp': int(time.time())+300})
    unsigned = header+b'.'+claims
    sig = base64.urlsafe_b64encode(hmac.new(ENV['JWT_KEY'].encode(), unsigned, hashlib.sha256).digest()).rstrip(b'=')
    return (unsigned+b'.'+sig).decode()


def basics():
    global TOKEN
    status, _ = request('/api/cargas', token='')
    check('JWT required', status == 401)
    status, result = request('/auth/login', 'POST', {'email': ENV['DEMO_EMAIL'], 'password': ENV['DEMO_PASSWORD']}, token='')
    check('Login', status == 200)
    TOKEN = result['accessToken']
    original = SAMPLE.read_bytes()
    load_id = upload(original, SAMPLE.name)
    result = wait_load(load_id, ('Notificado', 'Rechazado'))
    if result['load']['status'] == 'Notificado':
        counts = {k: result['load'][k] for k in ('inserted', 'existing', 'invalid')}
        check('Original Excel counts', counts == {'inserted': 116, 'existing': 84, 'invalid': 0}, counts)
        check('Lifecycle history', [r['status'] for r in result['history']] == ['Pendiente', 'En proceso', 'Cargado', 'Finalizado', 'Notificado'])
    else:
        check('Previously imported sample rejected', 'Periodo' in (result['load']['error'] or ''))
    status, downloaded = request(f'/api/cargas/{load_id}/archivo')
    check('Original file roundtrip', status == 200 and downloaded == original)
    check('Another user cannot read load', request('/api/cargas/'+load_id, token=forged_user_token())[0] == 404)
    check('Another user cannot read rows', request(f'/api/cargas/{load_id}/filas', token=forged_user_token())[0] == 404)
    repeated = upload(original)
    check('Repeated periods rejected', wait_load(repeated, ('Rechazado',))['load']['status'] == 'Rechazado')
    broken = upload(b'not a zip file')
    check('Corrupt XLSX audited and rejected', wait_load(broken, ('Rechazado',))['load']['error'] is not None)

    run = uuid.uuid4().hex[:10].upper()
    # Generate unique future periods without resetting any existing project data.
    year = 2100 + int(run[:4], 16) % 7800
    period = f'{year}-01'
    data = fixture([[period, run+'A', 'Valid', '12.30'], [period, run+'A', 'Duplicate', '1'],
                    [period, run+'B', None, None], [period, None, 'Missing code', '2'],
                    [period, run+'C', 'Invalid price', 'abc'], [None, None, None, None]])
    custom = upload(data)
    result = wait_load(custom)
    counts = {k: result['load'][k] for k in ('inserted', 'existing', 'invalid')}
    check('Defaults, duplicates, invalid and empty rows', counts == {'inserted': 2, 'existing': 1, 'invalid': 2}, counts)
    status, rows = request(f'/api/cargas/{custom}/filas')
    check('Per-row audit', status == 200 and rows['total'] == 5)
    default = next(r for r in rows['items'] if r['code'] == run+'B')
    check('Explicit default values', default['price'] == 0 and default['name'] == 'Producto '+run+'B')
    formula = upload(fixture([[f'{year}-02', run+'F', 'Formula', '1']], formula=True))
    check('Formulas rejected', wait_load(formula, ('Rechazado',))['load']['status'] == 'Rechazado')

    raw = fixture([[f'{year}-02', run+'LINK', 'External link', '1']])
    external = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as original, zipfile.ZipFile(external, 'w', zipfile.ZIP_DEFLATED) as target:
        for item in original.infolist():
            target.writestr(item.filename, original.read(item))
        target.writestr('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>')
    linked = upload(external.getvalue())
    check('External resource relationships rejected', wait_load(linked, ('Rechazado',))['load']['status'] == 'Rechazado')

    # All-or-nothing period reservation: rejection must not occupy the free period.
    mixed = upload(fixture([[period, run+'M', 'Occupied', '1'], [f'{year}-03', run+'N', 'Free', '1']]))
    wait_load(mixed, ('Rechazado',))
    free = upload(fixture([[f'{year}-03', run+'N', 'Free', '1']]))
    check('No partial reservations on rejection', wait_load(free)['load']['inserted'] == 1)

    concurrent_data = fixture([[f'{year}-04', run+'R', 'Race', '5']])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        ids = list(executor.map(lambda _: upload(concurrent_data), range(2)))
    statuses = [wait_load(i, ('Notificado', 'Rechazado'))['load']['status'] for i in ids]
    check('Concurrent overlapping loads: exactly one succeeds', sorted(statuses) == ['Notificado', 'Rechazado'], statuses)

    cross_period = upload(fixture([[f'{year}-05', run+'A', 'Already exists globally', '8']]))
    check('Code uniqueness across different periods', wait_load(cross_period)['load']['existing'] == 1)
    with urllib.request.urlopen(MAIL+'/api/v1/messages', timeout=5) as response:
        inbox = json.load(response)
    check('MailKit delivered to local SMTP inbox', inbox.get('messages_count', inbox.get('total', 0)) > 0)
    delivered_to = sql(f"select recipient from notifier.deliveries where load_id='{custom}'")
    expected_recipient = ENV.get('NOTIFICATION_TEST_RECIPIENT') or ENV['DEMO_EMAIL']
    check('Configured notification recipient honored', delivered_to == expected_recipient)
    settings_status, settings = request('/api/cargas/notificacion')
    check('Notification settings expose sender without secrets', settings_status == 200 and set(settings) == {'sender', 'defaultRecipient'} and settings['sender'])
    before = request('/api/cargas')[1]['total']
    for value in ['invalid-email', ','.join(f'user{i}@example.test' for i in range(6)), 'user@example.test\r\nBcc: hidden@example.test']:
        upload(data, recipients=value, expected_status=400)
    check('Invalid or excessive recipients rejected before creating a load', request('/api/cargas')[1]['total'] == before)
    explicit = upload(fixture([[f'{year}-12', run+'MAIL', 'Multiple recipients', '9']]), recipients='first@example.test;second@example.test;FIRST@example.test')
    explicit_result = wait_load(explicit)
    check('Chosen recipients persisted and deduplicated', explicit_result['load']['recipients'] == ['first@example.test', 'second@example.test'])
    check('Explicit recipients override test default end to end', sql(f"select recipient from notifier.deliveries where load_id='{explicit}'") == 'first@example.test, second@example.test')
    with urllib.request.urlopen(MAIL+'/api/v1/messages', timeout=5) as response:
        inbox = json.load(response)
    message = next(m for m in inbox['messages'] if explicit in m['Subject'])
    bcc = {a['Address'] for a in message.get('Bcc', [])}
    check('Recipients hidden from one another using Bcc', bcc == {'first@example.test', 'second@example.test'} and not message.get('To'))
    with tempfile.TemporaryDirectory() as folder:
        sample = Path(folder) / 'synthetic.xlsx'
        subprocess.run([sys.executable, str(ROOT / 'scripts/create_sample.py'), '--period', f'{year}-10', '--output', str(sample)], check=True, capture_output=True)
        generated_load = upload(sample.read_bytes(), 'synthetic.xlsx')
        generated_result = wait_load(generated_load)['load']
        check('Documented sample generator imports with expected results',
              (generated_result['inserted'], generated_result['existing'], generated_result['invalid']) == (3, 1, 1))
    return year, run


def recovery(year, run):
    # Pause AFTER committed product data, then kill before acknowledgement.
    delayed_env = os.environ.copy()
    delayed_env['AFTER_PERSIST_DELAY_MS'] = '15000'
    load_id = None
    try:
        compose('up', '-d', '--no-deps', 'importer', env=delayed_env)
        load_id = upload(fixture([[f'{year}-06', run+'REC', 'Recovery', '3']]))
        deadline = time.monotonic()+40
        while time.monotonic() < deadline:
            if sql(f"select stage from importer.jobs where load_id='{load_id}'") == 'Persisted':
                break
            time.sleep(.3)
        else:
            raise AssertionError('Worker never reached committed-data checkpoint')
        compose('kill', '-s', 'SIGKILL', 'importer')
    finally:
        compose('up', '-d', '--no-deps', 'importer')
    result = wait_load(load_id)
    count = sql(f"select count(*) from importer.products where load_id='{load_id}'")
    check('Crash after commit: recovery without duplicate products', result['load']['inserted'] == 1 and count == '1')

    # Durable acceptance while RabbitMQ is unavailable, then outbox recovery.
    try:
        compose('stop', '-t', '3', 'rabbitmq')
        queued = upload(fixture([[f'{year}-07', run+'OUT', 'Outbox', '4']]))
        time.sleep(2)
        result = request('/api/cargas/'+queued)[1]
        check('Accept upload while broker is down', result['load']['status'] == 'Pendiente')
    finally:
        compose('start', 'rabbitmq')
    check('Outbox publishes after broker recovers', wait_load(queued, timeout=90)['load']['inserted'] == 1)

    # SMTP outage must not revert the imported data.
    try:
        compose('stop', '-t', '3', 'mailpit')
        mail_load = upload(fixture([[f'{year}-08', run+'SMTP', 'SMTP retry', '5']]))
        result = wait_load(mail_load, ('Finalizado',))
        deadline = time.monotonic()+15
        while time.monotonic() < deadline:
            if sql(f"select count(*) from notifier.attempts where load_id='{mail_load}' and outcome='Failed'") != '0':
                break
            time.sleep(.3)
        else:
            raise AssertionError('No recorded SMTP failure')
        check('SMTP outage preserves imported data', result['load']['inserted'] == 1)
    finally:
        compose('start', 'mailpit')
    check('SMTP retry completes notification', wait_load(mail_load)['load']['status'] == 'Notificado')

    # Recreate stateless services and check that data, files and migrations survive.
    compose('restart', 'auth', 'control', 'importer', 'notifier', 'gateway')
    deadline = time.monotonic()+50
    restored = None
    while time.monotonic() < deadline:
        try:
            # Gateway health checks its own process/DB, not upstream readiness.
            # Wait for the actual authenticated history route after the restart.
            code, payload = request('/api/cargas/'+mail_load)
            if code == 200:
                restored = payload
                break
            assert code in (502, 503, 504), (code, payload)
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.5)
    check('Restart preserves history', restored is not None and restored['load']['status'] == 'Notificado', restored)
    check('No pending committed outbox messages', sql('select count(*) from platform.outbox where published_at is null') == '0')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--recovery', action='store_true', help='Also interrupt this project’s local containers')
    args = parser.parse_args()
    started = time.time()
    try:
        year, run = basics()
        if args.recovery:
            recovery(year, run)
    finally:
        artifacts = ROOT / 'artifacts'
        artifacts.mkdir(exist_ok=True)
        (artifacts / 'integration-results.json').write_text(json.dumps({'elapsed_seconds': round(time.time()-started, 2), 'checks': EVIDENCE}, ensure_ascii=False, indent=2))
    print(f'{len(EVIDENCE)} checks passed.', flush=True)
