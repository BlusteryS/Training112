export type DdsRecording = {
  finish: () => Promise<string>;
  cancel: () => void;
};

export async function startDdsRecording(onLimit: () => void): Promise<DdsRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Для разговора нужен HTTPS и доступ к микрофону.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    channelCount: { ideal: 1 }, echoCancellation: { exact: true },
    noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000 },
  } });
  const microphone = stream.getAudioTracks()[0];
  if (!microphone || microphone.getSettings().echoCancellation !== true) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Браузер не включил эхоподавление.');
  }
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    await context.audioWorklet.addModule('/audio-worklet.js');
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, 'pcm16-capture');
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(capture);
    capture.connect(silent).connect(context.destination);
    const frames: ArrayBuffer[] = [];
    capture.port.onmessage = ({ data }: MessageEvent<{ frame: ArrayBuffer }>) => {
      frames.push(data.frame);
    };
    timer = setTimeout(onLimit, 10_000);
    const audioContext = context;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      capture.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    }
    return {
      cancel: close,
      async finish() {
        close();
        const bytes = frames.map((frame) => new Uint8Array(frame));
        return btoa(bytes.map((frame) => String.fromCharCode(...frame)).join(''));
      },
    };
  } catch (error) {
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    if (context) await context.close();
    throw error;
  }
}
