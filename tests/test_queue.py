import asyncio
import unittest
from discoj.queue import Queue, video_id


class QueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_fifo_fallback_and_stale_event(self):
        q = Queue('abcdefghijk')
        q.connected = True
        q.advance()
        old = q.session
        await q.add('https://youtu.be/12345678901', 1, 'A')
        await q.add('https://youtube.com/watch?v=12345678902', 2, 'B')
        await q.report(old, 'ended')
        self.assertEqual(q.current.video_id, '12345678901')
        await q.report(q.session, 'ended')
        self.assertEqual(q.current.video_id, '12345678902')
        await q.report(q.session, 'ended')
        self.assertTrue(q.current.fallback)
        await q.report(q.session, 'error')
        self.assertIsNone(q.current)

    async def test_concurrent_duplicate_and_limit(self):
        q = Queue(limit=2)
        results = await asyncio.gather(*(q.add('https://youtu.be/12345678901', i, 'A') for i in range(10)), return_exceptions=True)
        self.assertEqual(sum(not isinstance(r, Exception) for r in results), 1)
        await q.add('https://youtu.be/12345678902', 2, 'B')
        with self.assertRaises(ValueError):
            await q.add('https://youtu.be/12345678903', 3, 'C')

    async def test_delete_permissions_and_stable_numbers(self):
        q = Queue()
        a = await q.add('https://youtu.be/12345678901', 1, 'A')
        b = await q.add('https://youtu.be/12345678902', 2, 'B')
        with self.assertRaises(ValueError):
            await q.delete(a.number, 2)
        await q.delete(a.number, 2, admin=True)
        self.assertEqual(q.current.number, b.number)
        await q.delete(b.number, 2)
        self.assertIsNone(q.current)

    async def test_invalid_urls(self):
        for url in ['https://evil.test/watch?v=12345678901','https://youtube.com/playlist?list=x','file:///12345678901']:
            with self.assertRaises(ValueError):
                video_id(url)
        self.assertEqual(video_id('https://www.youtube.com/shorts/12345678901'), '12345678901')
