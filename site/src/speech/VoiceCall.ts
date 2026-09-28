export type SpeechEvent =
  | { type: 'ready' | 'resumed' | 'listening' | 'barge_in' | 'closed' | 'pong' }
  | { type: 'ended'; message?: string }
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
  closed: (failed: boolean) => void;
};

/** Microphone capture stays connected throughout playback and interruption. */
export class VoiceCall {
  private closed = false;
  private ready = false;
  private generation = 0;
  private playback?: AudioWorkletNode;
  private stream?: MediaStream;
  private context?: AudioContext;
  private capture?: AudioWorkletNode;
  private input?: MediaStreamAudioSourceNode;
  private socket?: WebSocket;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastServerActivity = 0;
  private reconnectUntil = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly onPageHide = () => this.close();

  constructor(private readonly callbacks: CallCallbacks, private readonly attemptId: string) {}

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Для звонка откройте тренажёр по HTTPS. Доступ к микрофону по HTTP разрешён только на localhost. Обратитесь к администратору.');
    }
    window.addEventListener('pagehide', this.onPageHide);
    this.callbacks.status('Разрешите доступ к микрофону.');
    let timedOut = false;
    let microphoneTimer: ReturnType<typeof setTimeout> | undefined;
    const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: { ideal: 1 }, echoCancellation: { exact: true },
      noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
      sampleRate: { ideal: 48000 },
    } });
    void microphoneRequest.then((stream) => {
      if (timedOut) stream.getTracks().forEach((track) => track.stop());
    }).catch(() => undefined);
    try {
      this.stream = await Promise.race([
        microphoneRequest,
        new Promise<MediaStream>((_, reject) => {
          microphoneTimer = setTimeout(() => {
            timedOut = true;
            reject(new Error('Браузер не предоставил доступ к микрофону. Разрешите доступ и повторите подключение.'));
          }, 20_000);
        }),
      ]);
    } finally {
      clearTimeout(microphoneTimer);
    }
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
    await Promise.all([
      this.context.audioWorklet.addModule('/audio-worklet.js'),
      this.context.audioWorklet.addModule('/playback-worklet.js'),
    ]);
    if (this.closed) return;
    await this.context.resume();
    if (this.closed) return;
    this.playback = new AudioWorkletNode(this.context, 'pcm24-playback', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
    });
    this.playback.connect(this.context.destination);
    this.playback.onprocessorerror = () => this.close('Ошибка воспроизведения звука.');
    this.playback.port.onmessage = ({ data }: MessageEvent<{ type: string; generation: number; id: number }>) => {
      if (this.closed) return;
      if (data.type === 'overflow') {
        this.close('Переполнен буфер воспроизведения. Подключитесь повторно.');
      } else if (data.type === 'played' && data.generation === this.generation
        && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
      }
    };
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

    this.capture.port.onmessage = ({ data }: MessageEvent<{ frame: ArrayBuffer; capturedAt: number }>) => {
      const socket = this.socket;
      if (!this.ready || this.closed || !socket) return;
      if (this.context && this.context.currentTime - data.capturedAt > 0.5) return;
      if (socket.bufferedAmount > 32768) {
        this.reconnect();
      } else if (socket.readyState === WebSocket.OPEN) socket.send(data.frame);
    };
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/api/speech/session?attempt_id=${encodeURIComponent(this.attemptId)}`);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    this.connectionTimer = setTimeout(() => {
      if (this.socket === socket) this.reconnect();
    }, 10_000);
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return;
      this.lastServerActivity = Date.now();
      this.heartbeat = setInterval(() => {
        if (this.socket !== socket) return;
        if (Date.now() - this.lastServerActivity > 20_000) {
          this.reconnect();
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 5_000);
    };
    socket.onerror = () => {
      if (this.socket === socket) socket.close();
    };
    socket.onclose = () => {
      if (this.socket === socket) this.reconnect();
    };
    socket.onmessage = ({ data }: MessageEvent<string | ArrayBuffer>) => {
      if (this.closed || this.socket !== socket) return;
      this.lastServerActivity = Date.now();
      try {
        if (typeof data === 'string') this.event(JSON.parse(data) as SpeechEvent);
        else this.play(data);
      } catch {
        this.close('Ошибка передачи звука. Подключитесь повторно.');
      }
    };
  }

  private reconnect() {
    if (this.closed) return;
    this.ready = false;
    this.stopPlayback();
    clearTimeout(this.connectionTimer);
    clearInterval(this.heartbeat);
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.onopen = this.socket.onclose = this.socket.onerror = this.socket.onmessage = null;
      this.socket.close();
      this.socket = undefined;
    }
    if (!this.reconnectUntil) this.reconnectUntil = Date.now() + 25_000;
    if (Date.now() >= this.reconnectUntil) {
      this.close('Не удалось восстановить этот звонок. Данные попытки сохранены.');
      return;
    }
    this.callbacks.status('Восстанавливаем текущий звонок…');
    this.reconnectTimer = setTimeout(() => this.connect(), 750);
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
      case 'resumed':
      case 'ready':
        if (this.ready) break;
        clearTimeout(this.connectionTimer);
        this.ready = true;
        this.reconnectUntil = 0;
        this.callbacks.ready();
        this.callbacks.status('Заявитель на линии. Выслушайте его и задавайте уточняющие вопросы.');
        break;
      case 'listening':
      case 'barge_in':
        this.callbacks.status('Микрофон включён. Говорите с заявителем.');
        break;
      case 'transcript':
        this.callbacks.text('operator', event.text);
        break;
      case 'assistant':
        this.callbacks.text('caller', event.text, event.turn);
        break;
      case 'audio_stop':
        if (event.generation > this.generation) {
          this.generation = event.generation;
          this.stopPlayback();
        }
        break;
      case 'metrics':
        if (!event.value.interrupted) this.callbacks.status('Говорите следующую реплику.');
        break;
      case 'error':
      case 'busy':
      case 'unavailable':
        this.close(event.message || 'Звонок остановлен сервером. Повторите попытку.', true);
        break;
      case 'ended':
        this.close(event.message ?? 'Заявитель завершил разговор.', false);
        break;
      case 'closed':
        this.close('Соединение со звонком закрыто.');
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
      this.generation = generation;
      this.stopPlayback();
    }
    this.playback?.port.postMessage({
      type: 'audio', generation, id, samples: new Float32Array(packet, 12),
    }, [packet]);
  }

  private stopPlayback() {
    this.playback?.port.postMessage({ type: 'reset', generation: this.generation });
  }

  close(message?: string, failed = message !== undefined) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.ready = false;
    clearTimeout(this.connectionTimer);
    clearInterval(this.heartbeat);
    window.removeEventListener('pagehide', this.onPageHide);
    if (this.socket) {
      this.socket.onopen = this.socket.onclose = this.socket.onerror = this.socket.onmessage = null;
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'end', failed }));
      this.socket.close();
    }
    this.capture?.disconnect();
    this.playback?.disconnect();
    this.input?.disconnect();
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stopPlayback();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.callbacks.status(message ?? 'Разговор завершён.');
    this.callbacks.closed(failed);
  }
}
