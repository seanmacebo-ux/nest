"""Offline runner checks. No Claude, Telegram, Cloudflare, or real config reads."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('nest_inbox', '/Users/seanmacebo/babybean/nest_inbox.py')
inbox = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inbox)


class PollerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base_patch = patch.object(inbox, 'BASE', self.root)
        self.base_patch.start()
        self.cfg = {'claude_bin': '/test/claude', 'permission_mode': 'bypassPermissions', 'extra_dirs': ['/test/extra'], 'disallowed_tools': ['Forbidden']}
        self.runner = inbox.Inbox({'base_url': 'https://nest.test', 'worker_token': 'test-token'}, self.cfg)
        self.job = {'id': 'test-id', 'created_by': 'mishka', 'text': 'A question', 'files': [], 'lease_until': '2099-01-01T00:00:00Z'}

    def tearDown(self):
        self.base_patch.stop()
        self.temp.cleanup()

    def test_command_and_oauth(self):
        command = inbox.claude_command(self.cfg)
        self.assertIn('--dangerously-skip-permissions', command)
        self.assertNotIn('--resume', command)
        self.assertEqual(command[command.index('--output-format') + 1], 'json')
        self.assertIn('/test/extra', command)
        token = self.root / 'oauth'
        token.write_text('test-oauth')
        env = inbox.claude_env({**self.cfg, 'oauth_token_file': str(token), 'extra_env': {'EXTRA': 'present'}})
        self.assertEqual(env['CLAUDE_CODE_OAUTH_TOKEN'], 'test-oauth')
        self.assertEqual(env['EXTRA'], 'present')
        command = inbox.claude_command({**self.cfg, 'permission_mode': 'default'})
        self.assertNotIn('--dangerously-skip-permissions', command)
        self.assertIn('--permission-mode', command)

    def test_answer_json_and_identity(self):
        proc = Mock(returncode=0)
        proc.communicate.return_value = (json.dumps({'result': '**A warm answer**'}), '')
        with patch.object(inbox.subprocess, 'Popen', return_value=proc) as popen, patch.object(inbox, 'claude_env', return_value={}):
            self.assertEqual(self.runner.answer(self.job, ['/test/photo.jpg']), '**A warm answer**')
        cmd = popen.call_args.args[0]
        self.assertIn('Mishka', cmd[-1])
        self.assertIn('/test/photo.jpg', cmd[-1])
        self.assertEqual(popen.call_args.kwargs['cwd'], '/Users/seanmacebo')
        proc.communicate.assert_called_once_with(input='A question', timeout=2400)

    def test_hard_timeout_kills_tools(self):
        proc = Mock(pid=12345)
        proc.communicate.side_effect = [subprocess.TimeoutExpired('claude', 2400), ('', '')]
        with patch.object(inbox.subprocess, 'Popen', return_value=proc), patch.object(inbox, 'claude_env', return_value={}), patch.object(inbox.os, 'killpg') as kill:
            with self.assertRaisesRegex(TimeoutError, '40-minute'):
                self.runner.answer(self.job, [])
            kill.assert_called_once_with(12345, inbox.signal.SIGKILL)

    def test_post_reply_then_notify(self):
        self.runner.download = Mock(return_value=[])
        self.runner.answer = Mock(return_value='An answer')
        self.runner.call = Mock(return_value={'ok': True})
        notify = Mock()
        with patch.dict(sys.modules, {'telegram_notify': types.SimpleNamespace(notify=notify)}):
            self.runner.process(self.job)
        self.assertEqual(self.runner.call.call_args.args[0], 'reply/test-id')
        self.assertEqual(self.runner.call.call_args.args[1]['status'], 'done')
        notify.assert_called_once_with('📥 Mishka asked in the Nest app: A question. Answered there.')
        self.assertFalse((self.root / 'nest_inbox_pending.json').exists())

    def test_claude_error_posts_failed(self):
        self.runner.download = Mock(return_value=[])
        self.runner.answer = Mock(side_effect=RuntimeError('Claude failed'))
        self.runner.call = Mock(return_value={'ok': True})
        with patch.dict(sys.modules, {'telegram_notify': types.SimpleNamespace(notify=Mock())}):
            self.runner.process(self.job)
        self.assertEqual(self.runner.call.call_args.args[1]['status'], 'failed')

    def test_network_failure_preserves_reply(self):
        self.runner.download = Mock(return_value=[])
        self.runner.answer = Mock(return_value='An answer')
        self.runner.call = Mock(side_effect=RuntimeError('Worker reply returned HTTP 503'))
        with self.assertRaises(RuntimeError):
            self.runner.process(self.job)
        self.assertEqual(json.loads((self.root / 'nest_inbox_pending.json').read_text())['reply'], 'An answer')

    def test_expired_result_archived(self):
        self.runner.download = Mock(return_value=[])
        self.runner.answer = Mock(return_value='An answer')
        self.runner.call = Mock(side_effect=RuntimeError('Worker reply returned HTTP 409'))
        self.runner.process(self.job)
        self.assertTrue((self.root / 'nest_inbox/test-id/undelivered.json').exists())

    def test_download_keeps_file_inside_job(self):
        response = Mock(status_code=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = [b'PDF']
        self.runner.http.get = Mock(return_value=response)
        self.job['files'] = [{'id': 'file-id', 'name': '../../photo.pdf', 'size': 3}]
        paths = self.runner.download(self.job)
        self.assertEqual(Path(paths[0]).parent, self.root / 'nest_inbox/test-id')
        self.assertEqual(Path(paths[0]).read_bytes(), b'PDF')


if __name__ == '__main__':
    unittest.main()
