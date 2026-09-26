import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptionConnection } from '../src/lib/onboarding/realtime';
import { exampleFlow } from '../src/lib/onboarding/example';

const session = { siteId: 'test', subject: 'synthetic', flow: exampleFlow };
test('the WebRTC exchange preserves SDP framing and binds identity to the ephemeral credential', async () => {
  const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
  const answer = 'v=0\r\ns=answer\r\n';
  let count = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    if (++count === 1) {
      assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
      assert.match(headers.get('OpenAI-Safety-Identifier')!, /^[a-f0-9]{64}$/);
      const data = JSON.parse(init!.body as string);
      assert.equal(data.session.type, 'transcription');
      assert.equal(data.session.audio.input.transcription.language, 'it');
      assert.equal(data.session.audio.input.turn_detection.silence_duration_ms, 1200);
      return Response.json({ value: 'ephemeral-test-only' });
    }
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(headers.get('Authorization'), 'Bearer ephemeral-test-only');
    assert.equal(headers.get('Content-Type'), 'application/sdp');
    assert.equal(headers.get('OpenAI-Safety-Identifier'), null);
    // The provider rejects the same SDP if this final CRLF is removed.
    assert.equal(init?.body, offer);
    assert.ok((init?.body as string).endsWith('\r\n'));
    return new Response(answer);
  };
  assert.deepEqual(await transcriptionConnection(session, offer, fetcher), { sdp: answer });
  assert.equal(count, 2);
});
test('provider failures never expose the ephemeral credential or raw error to customers', async () => {
  let count = 0;
  const fetcher: typeof fetch = async () => ++count === 1 ? Response.json({ value: 'private-ephemeral' }) :
    Response.json({ error: 'raw provider error with private-ephemeral' }, { status: 400 });
  await assert.rejects(transcriptionConnection(session, 'v=0\r\n', fetcher), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Connessione vocale non disponibile. Riprova o usa i campi.');
    return true;
  });
});
test('empty and oversized offers are rejected before making provider requests', async () => {
  const fetcher: typeof fetch = async () => { assert.fail('No provider call expected'); };
  for (const offer of ['', '   ', null, 'v'.repeat(30001)])
    await assert.rejects(transcriptionConnection(session, offer, fetcher), /Campo non valido/);
});
