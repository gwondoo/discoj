"""Run interactively on the Mac; never prints Google secrets."""
import os
from pathlib import Path
from dotenv import dotenv_values, set_key


def main():
    from google_auth_oauthlib.flow import InstalledAppFlow
    path = Path('.env')
    config = dotenv_values(path)
    if not config.get('GOOGLE_CLIENT_ID') or not config.get('GOOGLE_CLIENT_SECRET'):
        raise SystemExit('.env에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 먼저 설정하세요.')
    flow = InstalledAppFlow.from_client_config({'installed': {
        'client_id': config['GOOGLE_CLIENT_ID'], 'client_secret': config['GOOGLE_CLIENT_SECRET'],
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
        'token_uri': 'https://oauth2.googleapis.com/token',
        'redirect_uris': ['http://localhost']}}, scopes=['https://www.googleapis.com/auth/youtube'])
    credentials = flow.run_local_server(port=0, access_type='offline', prompt='consent',
        authorization_prompt_message='브라우저에서 재생목록 소유 계정의 권한을 승인해주세요.',
        success_message='인증이 완료되었습니다. 창을 닫아도 됩니다.')
    if not credentials.refresh_token:
        raise SystemExit('리프레시 토큰을 받지 못했습니다. 동의 설정을 확인하세요.')
    set_key(str(path), 'GOOGLE_REFRESH_TOKEN', credentials.refresh_token)
    os.chmod(path, 0o600)
    print('인증 완료: 리프레시 토큰을 .env에 저장했습니다. 봇을 다시 시작하세요.')


if __name__ == '__main__':
    main()
