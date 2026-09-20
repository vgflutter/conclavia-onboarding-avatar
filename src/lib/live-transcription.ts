type Transcript = { id: string; text?: string; questionId: string; failed?: boolean };
/** Completion events may arrive out of order. Drain in microphone turn order. */
export class TranscriptQueue {
  private items: Transcript[] = [];
  private seen = new Set<string>();
  start(id: string, questionId: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.items.push({ id, questionId });
  }
  finish(id: string, text: string | undefined, questionId: string) {
    this.start(id, questionId);
    const item = this.items.find(i => i.id === id);
    if (item) { item.text = text; item.failed = text === undefined; }
    const ready: Transcript[] = [];
    while (this.items.length && (this.items[0].text !== undefined || this.items[0].failed)) ready.push(this.items.shift()!);
    return ready;
  }
}
export type LiveConnection = { stop: () => void; mute: (value: boolean) => void };
export async function startTranscription(options: {
  signal: AbortSignal; negotiate: (sdp: string) => Promise<string>; question: () => string;
  onText: (text: string, questionId: string, id: string) => void;
  onPartial: (text: string) => void; onSpeech: () => void; onError: (message: string) => void;
}): Promise<LiveConnection> {
  const peer = new RTCPeerConnection();
  let stream: MediaStream | undefined;
  let closed = false;
  const queue = new TranscriptQueue();
  const partials = new Map<string, string>();
  const stop = () => {
    if (closed) return;
    closed = true;
    options.signal.removeEventListener('abort', stop);
    stream?.getTracks().forEach(track => track.stop());
    peer.close();
  };
  options.signal.addEventListener('abort', stop, { once: true });
  try {
    options.signal.throwIfAborted();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    if (closed) { stream.getTracks().forEach(t => t.stop()); throw new Error('Connessione annullata'); }
    for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
    const channel = peer.createDataChannel('oai-events');
    channel.onmessage = event => {
      if (closed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'input_audio_buffer.speech_started') {
          queue.start(data.item_id, options.question()); options.onSpeech();
        }
        if (data.type === 'conversation.item.input_audio_transcription.delta') {
          partials.set(data.item_id, (partials.get(data.item_id) || '') + (data.delta || ''));
          options.onPartial(partials.get(data.item_id) || '');
        }
        if (data.type === 'conversation.item.input_audio_transcription.completed' || data.type === 'conversation.item.input_audio_transcription.failed') {
          partials.delete(data.item_id); options.onPartial('');
          for (const item of queue.finish(data.item_id, data.transcript, options.question())) {
            if (item.failed) options.onError('Non ho ricevuto la trascrizione. Ripeti la risposta o usa i campi.');
            else if (item.text?.trim()) options.onText(item.text.trim(), item.questionId, item.id);
          }
        }
        if (data.type === 'error') { stop(); options.onError('Il collegamento audio è stato interrotto. Puoi riconnetterti.'); }
      } catch { stop(); options.onError('Evento audio non valido. Riconnetti il microfono.'); }
    };
    peer.onconnectionstatechange = () => {
      if (!closed && ['failed', 'disconnected'].includes(peer.connectionState)) {
        stop(); options.onError('Connessione audio interrotta. Le risposte salvate sono disponibili.');
      }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await options.negotiate(offer.sdp || '');
    options.signal.throwIfAborted();
    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Connessione audio scaduta')); }, 15_000);
      const abort = () => { cleanup(); reject(new Error('Connessione annullata')); };
      const cleanup = () => { clearTimeout(timer); options.signal.removeEventListener('abort', abort); };
      options.signal.addEventListener('abort', abort, { once: true });
      channel.onopen = () => { cleanup(); resolve(); };
      channel.onerror = () => { cleanup(); reject(new Error('Canale audio non disponibile')); };
      if (channel.readyState === 'open') { cleanup(); resolve(); }
      if (options.signal.aborted) abort();
    });
    return { stop, mute: value => stream?.getAudioTracks().forEach(track => { track.enabled = !value; }) };
  } catch (error) { stop(); throw error; }
}
