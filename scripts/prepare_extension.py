"""Prepare a private local extension copy without printing credentials."""
import json
import os
import secrets
import shutil
from pathlib import Path
from dotenv import dotenv_values, set_key

root = Path(__file__).resolve().parents[1]
env = root / '.env'
token = dotenv_values(env).get('PLAYBACK_TOKEN') or secrets.token_urlsafe(32)
set_key(str(env), 'PLAYBACK_TOKEN', token)
os.chmod(env, 0o600)
target = root / 'data' / 'browser-extension'
shutil.copytree(root / 'browser-extension', target, dirs_exist_ok=True)
(target / 'config.js').write_text('const DISCOJ_TOKEN = ' + json.dumps(token) + ';\n')
os.chmod(target / 'config.js', 0o600)
print('설치용 확장 프로그램 폴더:', target)
