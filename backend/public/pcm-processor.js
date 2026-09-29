// pcm-processor.js — AudioWorklet: Float32 mic -> PCM16 @24kHz, plus playback sink
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', CaptureProcessor);

// Playback: receives base64 PCM16 chunks from the main thread, plays at 24kHz
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.port.onmessage = (e) => {
      const { pcm16 } = e.data; // Int16Array
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      this.queue.push(float32);
    };
  }
  process(inputs, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    let written = 0;
    while (written < out.length && this.queue.length) {
      const chunk = this.queue[0];
      const n = Math.min(chunk.length, out.length - written);
      out.set(chunk.subarray(0, n), written);
      if (n < chunk.length) {
        this.queue[0] = chunk.subarray(n);
      } else {
        this.queue.shift();
      }
      written += n;
    }
    // silence for the remainder (underrun)
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
