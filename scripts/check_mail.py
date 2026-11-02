"""Report SMTP readiness without printing passwords or sending an email."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / '.env'
if not path.exists():
    raise SystemExit('Create private .env with python3 backend/tests/setup_env.py')
values = dict(line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
keys = ['MAILERSEND_SMTP_USER', 'MAILERSEND_SMTP_PASSWORD', 'MAILERSEND_FROM', 'NOTIFICATION_TEST_RECIPIENT']
missing = [key for key in keys if not values.get(key, '').strip()]
print('Test recipient:', values.get('NOTIFICATION_TEST_RECIPIENT') or '(user email from JWT)')
print('Local mode: MailKit -> Mailpit. No email is delivered to an external inbox.')
if missing:
    print('MailerSend is not ready. Missing:', ', '.join(missing))
    sys.exit(1)
print('MailerSend fields configured. Verify sender domain/account restrictions in MailerSend before live SMTP test.')
