export type SpeechEvent =
  | { type: 'ready' | 'listening' | 'barge_in' | 'closed' | 'ended' | 'pong' }
  | { type: 'waiting'; estimated_wait_seconds: number }
  | { type: 'transcript'; text: string }
  | { type: 'assistant'; text: string; turn: number }
  | { type: 'audio_stop'; generation: number }
  | { type: 'metrics'; value: { interrupted: boolean } }
  | { type: 'error' | 'busy' | 'unavailable'; message: string };

type CallCallbacks = {
  status: (message: string) => void;
  ready: () => void;
  waiting: (seconds: number) => void;
  text: (speaker: 'operator' | 'caller', text: string, turn?: number) => void;
  closed: () => void;
};

/** Microphone capture stays connected throughout playback and interruption. */
export class VoiceCall {
  private closed = false;
  private ready = false;
  private generation = 0;
  private scheduledAt = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private stream?: MediaStream;
  private context?: AudioContext;
  private capture?: AudioWorkletNode;
  private input?: MediaStreamAudioSourceNode;
  private socket?: WebSocket;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastServerActivity = 0;
  private readonly onPageHide = () => this.close();

  constructor(private readonly callbacks: CallCallbacks) {}

  async start() {
    window.addEventListener('pagehide', this.onPageHide);
    this.callbacks.status('Разрешите доступ к микрофону.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: { ideal: 1 }, echoCancellation: { exact: true },
      noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
      sampleRate: { ideal: 48000 },
    } });
    if (this.closed) {
      this.stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const microphone = this.stream.getAudioTracks()[0];
    if (!microphone || microphone.getSettings().echoCancellation !== true) {
      throw new Error('Браузер не включил эхоподавление.');
    }
    microphone.contentHint = 'speech';
    microphone.onended = () => this.close('Микрофон отключён.');
    this.context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    await this.context.audioWorklet.addModule('/audio-worklet.js');
    if (this.closed) return;
    await this.context.resume();
    if (this.closed) return;
    this.capture = new AudioWorkletNode(this.context, 'pcm16-capture');
    this.input = this.context.createMediaStreamSource(this.stream);
    this.input.connect(this.capture);
    const silent = this.context.createGain();
    silent.gain.value = 0;
    this.capture.connect(silent).connect(this.context.destination);
    this.capture.onprocessorerror = () => this.close('Ошибка обработки микрофона.');
    this.context.onstatechange = () => {
      if (!this.closed && this.ready && this.context?.state !== 'running') {
        this.close('Воспроизведение приостановлено браузером. Подключитесь повторно.');
      }
    };

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/api/speech/session`);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    this.connectionTimer = setTimeout(() => this.close('Сервер не ответил. Попробуйте позже.'), 90_000);
    this.capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (!this.ready || this.closed) return;
      if (socket.bufferedAmount > 32000) {
        this.close('Соединение не успевает передавать звук. Подключитесь повторно.');
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    };
    socket.onopen = () => {
      if (this.closed) return;
      clearTimeout(this.connectionTimer);
      this.lastServerActivity = Date.now();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastServerActivity > 20_000) {
          this.close('Сервер не отвечает. Проверьте соединение.');
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 5_000);
    };
    socket.onerror = () => this.close('Не удалось подключиться. Проверьте соединение и вход в аккаунт.');
    socket.onclose = () => this.close('Разговор завершён.');
    socket.onmessage = ({ data }: MessageEvent<string | ArrayBuffer>) => {
      if (this.closed) return;
      this.lastServerActivity = Date.now();
      try {
        if (typeof data === 'string') this.event(JSON.parse(data) as SpeechEvent);
        else this.play(data);
      } catch {
        this.close('Ошибка передачи звука. Подключитесь повторно.');
      }
    };
  }

  private event(event: SpeechEvent) {
    switch (event.type) {
      case 'waiting':
        if (!this.ready && Number.isFinite(event.estimated_wait_seconds)) {
          this.callbacks.waiting(Math.max(1, event.estimated_wait_seconds));
        }
        break;
      case 'pong':
        break;
      case 'ready':
        if (this.ready) break;
        clearTimeout(this.connectionTimer);
        this.ready = true;
        this.callbacks.ready();
        this.callbacks.status('Звонящий подключён. Можно говорить и перебивать.');
        break;
      case 'listening':
      case 'barge_in':
        this.callbacks.status('Слушаю…');
        break;
      case 'transcript':
        this.callbacks.text('operator', event.text);
        break;
      case 'assistant':
        this.callbacks.text('caller', event.text, event.turn);
        break;
      case 'audio_stop':
        if (event.generation > this.generation) {
          this.stopPlayback();
          this.generation = event.generation;
        }
        break;
      case 'metrics':
        if (!event.value.interrupted) this.callbacks.status('Говорите следующую реплику.');
        break;
      case 'error':
      case 'busy':
      case 'unavailable':
        this.close(event.message);
        break;
      case 'ended':
        this.close('Звонящий завершил разговор.');
        break;
      case 'closed':
        this.close();
        break;
    }
  }

  private play(packet: ArrayBuffer) {
    const context = this.context;
    if (!context || packet.byteLength < 16 || packet.byteLength % 4) throw new Error('Invalid audio packet');
    const header = new DataView(packet, 0, 12);
    const generation = header.getUint32(0, true);
    const id = header.getUint32(4, true);
    const rate = header.getUint32(8, true);
    if (rate !== 24000) throw new Error('Invalid sample rate');
    if (generation < this.generation) return;
    if (generation > this.generation) {
      this.stopPlayback();
      this.generation = generation;
    }
    if (this.scheduledAt - context.currentTime > 0.5) throw new Error('Playback queue exceeded');
    const samples = new Float32Array(packet, 12);
    const buffer = context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.015, this.scheduledAt);
    this.scheduledAt = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (!this.closed && generation === this.generation && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'played', generation, id }));
      }
    };
    source.start(start);
  }

  private stopPlayback() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.scheduledAt = this.context?.currentTime ?? 0;
  }

  close(message = 'Разговор завершён.') {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    clearTimeout(this.connectionTimer);
    clearInterval(this.heartbeat);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'end' }));
      this.socket.close();
    }
    this.capture?.disconnect();
    this.input?.disconnect();
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stopPlayback();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.callbacks.status(message);
    this.callbacks.closed();
  }
}
