"""Build and verify a disposable Compose project; preserve the user's running data."""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
artifacts = root / 'artifacts'
artifacts.mkdir(exist_ok=True)
env_file = artifacts / ('verification-' + secrets.token_hex(4) + '.env')
project = 'majestic-verify-' + secrets.token_hex(4)
subprocess.run([sys.executable, 'backend/tests/setup_env.py', '--file', str(env_file)], cwd=root, check=True)
content = env_file.read_text()
ports = {}
held = []
for key in ['API_PORT', 'WEB_PORT', 'MAIL_UI_PORT', 'RABBIT_UI_PORT']:
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    ports[key] = str(sock.getsockname()[1])
    held.append(sock)
    content = '\n'.join(key+'='+ports[key] if line.startswith(key+'=') else line for line in content.splitlines())+'\n'
content = content.replace('NOTIFICATION_TEST_RECIPIENT=\n', 'NOTIFICATION_TEST_RECIPIENT=recipient-check@example.test\n')
env_file.write_text(content)
env_file.chmod(0o600)
env = os.environ.copy()
env.pop('COMPOSE_FILE', None)
env.update(dict(line.split('=', 1) for line in content.splitlines() if line and not line.startswith('#')))
env.update(COMPOSE_PROJECT_NAME=project, CARGAS_ENV_FILE=str(env_file), PYTHONDONTWRITEBYTECODE='1')
compose = ['docker', 'compose', '--env-file', str(env_file)]
for sock in held:
    sock.close()
print('Disposable verification project:', project, flush=True)
try:
    subprocess.run(compose+['up', '-d', '--build', '--wait', '--wait-timeout', '180'], cwd=root, env=env, check=True)
    # Verify the exported SQL is valid and safely skips startup-applied migrations.
    with (root/'backend/database/migrate.sql').open() as sql:
        subprocess.run(compose+['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'app', '-d', 'cargas'], stdin=sql, cwd=root, env=env, check=True)
    for script, arguments in [('integration.py', ['--recovery']), ('benchmark.py', ['--rows', '10000']), ('persistence.py', [])]:
        subprocess.run([sys.executable, 'backend/tests/'+script, *arguments], cwd=root, env=env, check=True)
    print('Unified verification passed; existing app data was not used.', flush=True)
except BaseException:
    subprocess.run(compose+['logs', '--tail=40'], cwd=root, env=env, check=False)
    raise
finally:
    # Only the disposable project created by this script is removed.
    subprocess.run(compose+['down', '-v', '--remove-orphans'], cwd=root, env=env, check=False)
    env_file.unlink(missing_ok=True)
