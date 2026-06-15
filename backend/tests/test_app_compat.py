import os
import sys

from pathlib import Path
from unittest.mock import AsyncMock

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

import app  # noqa: E402


@pytest.mark.asyncio
async def test_send_message_compat_awaits_stable_send_message():
    message = object()

    class FakeSendMessageRequest:
        def __init__(self, *, message):
            self.message = message

    async def stable_stream():
        yield 'stable-event'

    class StableClient:
        def __init__(self):
            self.request = None

        async def send_message(self, request):
            self.request = request
            return stable_stream()

    client = StableClient()
    original_request_type = app.SendMessageRequest
    app.SendMessageRequest = FakeSendMessageRequest
    try:
        stream = await app._send_message_compat(client, message)
    finally:
        app.SendMessageRequest = original_request_type

    assert [item async for item in stream] == ['stable-event']
    assert client.request.message is message


@pytest.mark.asyncio
async def test_send_message_compat_falls_back_to_legacy_message():
    message = object()

    class LegacySendMessageRequest:
        def __init__(self, *, message):
            raise TypeError('legacy client path')

    async def legacy_stream():
        yield 'legacy-event'

    class LegacyClient:
        def __init__(self):
            self.message = None

        def send_message(self, message):
            self.message = message
            return legacy_stream()

    client = LegacyClient()
    original_request_type = app.SendMessageRequest
    app.SendMessageRequest = LegacySendMessageRequest
    try:
        stream = await app._send_message_compat(client, message)
    finally:
        app.SendMessageRequest = original_request_type

    assert [item async for item in stream] == ['legacy-event']
    assert client.message is message


@pytest.mark.asyncio
async def test_process_a2a_response_handles_stable_stream_response():
    response_id = 'agent-message-1'

    class Message:
        id = response_id

    class StreamResponse:
        def __init__(self, message):
            self.message = message

    stream_response = StreamResponse(Message())
    StreamResponse.WhichOneof = lambda self, field_name: (
        'message' if field_name == 'payload' else None
    )
    original_to_dict = app._to_dict
    original_emit_debug_log = app._emit_debug_log
    original_socket_emit = app.sio.emit
    debug_log = AsyncMock()
    socket_emit = AsyncMock()

    app._to_dict = lambda obj: {
        'parts': [{'text': 'hello'}],
        'role': 'ROLE_AGENT',
    }
    app._emit_debug_log = debug_log
    app.sio.emit = socket_emit
    try:
        await app._process_a2a_response(
            stream_response,
            sid='sid-123',
            request_id='request-123',
        )
    finally:
        app._to_dict = original_to_dict
        app._emit_debug_log = original_emit_debug_log
        app.sio.emit = original_socket_emit

    debug_payload = debug_log.await_args.args[3]
    assert debug_payload['id'] == response_id
    assert debug_payload['kind'] == 'message'
    assert debug_payload['validation_errors'] == []
    socket_emit.assert_awaited_once_with(
        'agent_response',
        debug_payload,
        to='sid-123',
    )
