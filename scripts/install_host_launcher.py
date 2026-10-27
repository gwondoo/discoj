"""Install the fixed-profile user launcher without exposing its token."""
import os
import plistlib
import secrets
import shutil
import json
import subprocess
from pathlib import Path
from dotenv import dotenv_values, set_key

root = Path(__file__).resolve().parents[1]
env = root / '.env'
if not dotenv_values(env).get('HOST_LAUNCH_TOKEN'):
    set_key(str(env), 'HOST_LAUNCH_TOKEN', secrets.token_urlsafe(32))
os.chmod(env, 0o600)
(root / 'data').mkdir(exist_ok=True)
# launchd cannot read a Downloads checkout under macOS privacy protection.
# Keep only this fixed helper and its private runtime in Application Support.
support = Path.home() / 'Library/Application Support/DiscoJ'
support.mkdir(parents=True, exist_ok=True)
os.chmod(support, 0o700)
runtime = support / 'runtime'
if not runtime.exists():
    shutil.copytree(root / '.venv', runtime, symlinks=True)
shutil.copy2(root / 'discoj/host_launcher.py', support / 'host_launcher.py')
config = support / 'host-launcher.json'
config.write_text(json.dumps({'profile':'Default', 'token':dotenv_values(env)['HOST_LAUNCH_TOKEN']}))
os.chmod(config, 0o600)
label = 'com.discoj.chrome-launcher'
folder = Path.home() / 'Library/LaunchAgents'
folder.mkdir(parents=True, exist_ok=True)
path = folder / (label + '.plist')
with path.open('wb') as out:
    plistlib.dump({'Label':label, 'ProgramArguments':[str(runtime / 'bin/python'), str(support / 'host_launcher.py')],
        'WorkingDirectory':str(support), 'RunAtLoad':True, 'KeepAlive':True,
        'StandardOutPath':str(support / 'host-launcher.log'),
        'StandardErrorPath':str(support / 'host-launcher.log')}, out)
subprocess.run(['launchctl','bootout',f'gui/{os.getuid()}',str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(path)],check=True)
print('Installed DiscoJ Chrome launcher (company profile: Default, port: 18769)')
