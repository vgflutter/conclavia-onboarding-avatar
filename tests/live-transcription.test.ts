import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { startTranscription } from '../src/lib/live-transcription';

async function microphone(t: TestContext) {
  const events: string[] = [];
  const captions: string[] = [];
  const answers: string[] = [];
  const track = { enabled: true, stop: () => events.push('track stopped') };
  const channel = {
    readyState: 'open', onmessage: null as null | ((event: { data: string }) => void),
    send: (value: string) => events.push(JSON.parse(value).type),
  };
  class Peer {
    addTrack() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() { events.push('peer closed'); }
  }
  for (const [key, value] of Object.entries({ RTCPeerConnection: Peer, navigator: {
    mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) },
  } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const controller = new AbortController();
  const connection = await startTranscription({ signal: controller.signal, negotiate: async () => 'answer', question: () => 'question',
    onSpeech: () => events.push('speaking'), onSpeechEnd: () => events.push('speech ended'),
    onPartial: value => captions.push(value), onText: value => answers.push(value), onError: value => events.push(value),
  });
  t.after(() => connection.stop());
  const emit = (type: string, item_id: string, extra = {}) => channel.onmessage?.({ data: JSON.stringify({ type, item_id, ...extra }) });
  return { events, captions, answers, track, controller, connection, emit };
}
const started = 'input_audio_buffer.speech_started';
const delta = 'conversation.item.input_audio_transcription.delta';
const completed = 'conversation.item.input_audio_transcription.completed';

test('an earlier completion preserves the newer utterance captions and keeps speech active', async t => {
  const m = await microphone(t);
  m.emit(started, 'first'); m.emit(delta, 'first', { delta: 'first' });
  m.emit(started, 'second'); m.emit(delta, 'second', { delta: 'second' });
  m.emit(completed, 'first', { transcript: 'first' });
  assert.equal(m.captions.at(-1), 'second');
  assert.equal(m.events.includes('speech ended'), false);
  m.emit(completed, 'second', { transcript: 'second' });
  assert.equal(m.captions.at(-1), '');
  assert.equal(m.events.filter(value => value === 'speech ended').length, 1);
  assert.deepEqual(m.answers, ['first', 'second']);
});

test('out-of-order completions still deliver original microphone order', async t => {
  const m = await microphone(t);
  m.emit(started, 'first'); m.emit(started, 'second');
  m.emit(completed, 'second', { transcript: 'second' });
  assert.deepEqual(m.answers, []);
  assert.equal(m.events.includes('speech ended'), false);
  m.emit(completed, 'first', { transcript: 'first' });
  assert.deepEqual(m.answers, ['first', 'second']);
  assert.equal(m.events.filter(value => value === 'speech ended').length, 1);
});

test('an empty transcription ends the listening animation without submitting an answer', async t => {
  const m = await microphone(t);
  m.emit(started, 'empty'); m.emit(completed, 'empty', { transcript: '  ' });
  assert.equal(m.events.at(-1), 'speech ended');
  assert.deepEqual(m.answers, []);
});

test('pause excludes old delayed transcripts even after resuming and clears upstream audio', async t => {
  const m = await microphone(t);
  m.emit(started, 'old'); m.connection.mute(true);
  assert.equal(m.track.enabled, false);
  assert.ok(m.events.includes('input_audio_buffer.clear'));
  m.connection.mute(false); m.emit(completed, 'old', { transcript: 'stale' });
  m.emit(started, 'new'); m.emit(completed, 'new', { transcript: 'fresh' });
  assert.equal(m.track.enabled, true);
  assert.deepEqual(m.answers, ['fresh']);
});

test('aborting closes microphone exactly once and ignores subsequent provider events', async t => {
  const m = await microphone(t);
  m.emit(started, 'old'); m.controller.abort(); m.connection.stop();
  m.emit(completed, 'old', { transcript: 'stale' });
  assert.deepEqual(m.answers, []);
  assert.equal(m.events.filter(value => value === 'track stopped').length, 1);
  assert.equal(m.events.filter(value => value === 'peer closed').length, 1);
});
