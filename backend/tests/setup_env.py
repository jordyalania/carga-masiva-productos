"""Generate local credentials once; preserve existing .env."""
import argparse
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--file', type=Path, default=root / '.env')
args = parser.parse_args()
target = args.file.resolve()
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    print('.env already exists; left unchanged')
else:
    content = (root / '.env.example').read_text()
    content = content.replace('replace-with-random-value', secrets.token_hex(24), 1)
    content = content.replace('replace-with-random-value', secrets.token_hex(24), 1)
    content = content.replace('replace-with-at-least-32-random-bytes', secrets.token_hex(32))
    content = content.replace('replace-with-random-value', secrets.token_hex(32))
    content = content.replace('replace-with-a-long-password', secrets.token_urlsafe(24))
    with target.open('x') as f:
        f.write(content)
    target.chmod(0o600)
    print('Created .env with random local credentials (not printed).')
