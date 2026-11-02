"""Explicit live-mail smoke test: uploads one product and sends one notification."""
import json
import time
import uuid
import integration as api

recipient = api.ENV.get('NOTIFICATION_TEST_RECIPIENT', '').strip()
required = ['MAILERSEND_SMTP_USER', 'MAILERSEND_SMTP_PASSWORD', 'MAILERSEND_FROM']
if not recipient or any(not api.ENV.get(key) for key in required):
    raise SystemExit('Configure private MailerSend SMTP credentials and test recipient first. No mail sent.')
# Confirm the running service is really using the live provider before creating data.
# Compose file selection can vary; inspect the actual running container, without printing secrets.
container = api.compose('ps', '-q', 'notifier').strip()
import subprocess
actual = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
values = dict(pair.split('=', 1) for pair in actual['Config']['Env'] if '=' in pair)
if values.get('Smtp__Host') != 'smtp.mailersend.net' or values.get('Notification__RecipientOverride') != recipient:
    raise SystemExit('Notifier is not using the requested MailerSend/test-recipient configuration. No mail sent.')
status, session = api.request('/auth/login', 'POST', {'email': api.ENV['DEMO_EMAIL'], 'password': api.ENV['DEMO_PASSWORD']}, token='')
assert status == 200, status
api.TOKEN = session['accessToken']
key = uuid.uuid4().hex[:12].upper()
year = 2100 + int(key[:4], 16) % 7800
load_id = api.upload(api.fixture([[f'{year}-11', 'SMTP-'+key, 'Prueba de notificación SMTP', '10.00']]), 'prueba-correo.xlsx')
result = api.wait_load(load_id, timeout=120)
print(json.dumps({'load_id': load_id, 'recipient': recipient, 'status': result['load']['status'], 'note': 'Accepted by SMTP; check the destination inbox/spam to confirm delivery.'}, ensure_ascii=False, indent=2))
