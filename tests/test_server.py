import unittest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from discoj.main import create_app
from discoj.queue import Queue


class ServerTests(unittest.TestCase):
    def test_playback_events_advance_queue(self):
        q = Queue('abcdefghijk')
        with TestClient(create_app(q)) as client:
            with client.websocket_connect('/ws/player', headers={'origin':'http://127.0.0.1:8000'}) as ws:
                first = ws.receive_json()
                client.portal.call(q.add, 'https://youtu.be/12345678901', '1', 'A')
                while True:
                    state = ws.receive_json()
                    if state.get('current', {}).get('video_id') == '12345678901':
                        break
                ws.send_json({'type':'event', 'session':first['session'], 'event':'ended'})
                ws.send_json({'type':'ping'})
                while ws.receive_json().get('type') != 'pong':
                    pass
                self.assertEqual(q.current.video_id, '12345678901')
                ws.send_json({'type':'event', 'session':state['session'], 'event':'ended'})
                while True:
                    result = ws.receive_json()
                    if result.get('current', {}).get('fallback'):
                        break
                self.assertTrue(q.current.fallback)

    def test_page_health_origin_single_player_disconnect(self):
        q = Queue()
        with TestClient(create_app(q)) as client:
            self.assertEqual(client.get('/').status_code, 200)
            self.assertEqual(client.get('/health').json()['bot'], 'not_configured')
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect('/ws/player', headers={'origin':'https://evil.test'}):
                    pass
            with client.websocket_connect('/ws/player', headers={'origin':'http://127.0.0.1:8000'}) as ws:
                self.assertTrue(ws.receive_json()['connected'])
                with self.assertRaises(WebSocketDisconnect):
                    with client.websocket_connect('/ws/player', headers={'origin':'http://127.0.0.1:8000'}):
                        pass
                ws.send_json({'type':'ping'})
                self.assertEqual(ws.receive_json(), {'type':'pong'})
            self.assertFalse(q.connected)
            self.assertEqual(q.status, 'offline')
