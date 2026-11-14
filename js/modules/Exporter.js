import {
  Output,
  Mp4OutputFormat,
  MovOutputFormat,
  StreamTarget,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio
} from 'mediabunny';
import { OfflineAnalyser } from './OfflineAnalyser.js';

// Scene updates per second of video. The preview advances motion once per
// display frame (60 Hz), so the export simulates at the same rate to move
// identically — a 30 FPS export runs two updates per rendered frame.
const SIM_RATE = 60;

// Analysis run-in before the first frame, so smoothing and beat history are
// already warm when a clip starts mid-song
const PREROLL_TICKS = SIM_RATE;

// An error whose message is safe to show to the user as-is
export class ExportError extends Error {}

// Unlike setTimeout, message events aren't throttled in background tabs
const yieldToBrowser = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = resolve;
  channel.port2.postMessage(null);
});

// Holds the file being written as Blobs rather than one growing ArrayBuffer:
// the browser can move Blobs out of memory, which matters for a
// few-hundred-megabyte video on a phone.
class BlobSink {
  constructor() {
    this.parts = []; // { start, end, blob } — sorted, non-overlapping
    this.size = 0;
  }

  write(data, position) {
    const end = position + data.byteLength;
    const blob = new Blob([data]);

    if (position === this.size) {
      this.parts.push({ start: position, end, blob });
    } else {
      // The muxer went back to patch earlier bytes (e.g. the header's size
      // fields): cut the new piece into whatever it overlaps
      const kept = [];
      for (const part of this.parts) {
        if (part.end <= position || part.start >= end) {
          kept.push(part);
          continue;
        }
        if (part.start < position) {
          kept.push({ start: part.start, end: position, blob: part.blob.slice(0, position - part.start) });
        }
        if (part.end > end) {
          kept.push({ start: end, end: part.end, blob: part.blob.slice(end - part.start) });
        }
      }
      if (position > this.size) {
        kept.push({ start: this.size, end: position, blob: new Blob([new Uint8Array(position - this.size)]) });
      }
      kept.push({ start: position, end, blob });
      this.parts = kept.sort((a, b) => a.start - b.start);
    }

    this.size = Math.max(this.size, end);
  }

  toBlob(type) {
    return new Blob(this.parts.map((part) => part.blob), { type });
  }
}

// Renders the visuals to a video file frame by frame instead of recording the
// screen in real time. Every frame is drawn and encoded no matter how long it
// takes, so the result is smooth at any resolution on any device.
export class Exporter {
  constructor(app) {
    this.app = app;
    this.isExporting = false;
    this.cancelRequested = false;
  }

  static isSupported() {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  cancel() {
    this.cancelRequested = true;
  }

  // Render `duration` seconds of the loaded track starting at `startTime`
  // (both in seconds; duration null = to the end). Resolves with
  // { blob, filename }, or null if cancelled. onProgress gets 0..1.
  async export({ startTime = 0, duration = null, onProgress = null } = {}) {
    if (this.isExporting) return null;

    const { rendererManager, audioManager, effectController, postProcessor, recorder } = this.app;
    if (!audioManager?.file) throw new ExportError('Load a track first.');

    const canvas = rendererManager.renderer.domElement;
    const { width, height } = canvas;
    const fps = window.matchMedia('(pointer: coarse)').matches ? 30 : 60;
    const ticksPerFrame = SIM_RATE / fps;
    const tickMs = 1000 / SIM_RATE;

    // ~6 Mbps at 1080p30, ~12 at 1080p60, capped for 4K
    const videoBitrate = Math.round(Math.min(40_000_000, Math.max(4_000_000, width * height * fps * 0.1)));

    if (!(await canEncodeVideo('avc', { width, height, bitrate: videoBitrate }))) {
      throw new ExportError(`This device can't encode ${width}×${height} video. Try a lower quality.`);
    }

    this.isExporting = true;
    this.cancelRequested = false;
    rendererManager.isExporting = true; // pause the live render loop
    audioManager.pause();
    recorder.acquireWakeLock();

    const afterimageDamp = postProcessor.afterimagePass.uniforms['damp'];
    const originalDamp = afterimageDamp.value;
    let output = null;

    try {
      const audioBuffer = await audioManager.decodeFile();
      const sampleRate = audioBuffer.sampleRate;
      const channelCount = audioBuffer.numberOfChannels;

      const start = Math.min(Math.max(0, startTime), audioBuffer.duration);
      const length = Math.min(duration ?? Infinity, audioBuffer.duration - start);
      const totalFrames = Math.round(length * fps);
      if (totalFrames < 1) throw new ExportError('Nothing to export — move the playhead back from the end of the track.');

      // AAC in MP4 plays and uploads everywhere. Browsers without an AAC
      // encoder (Safari before 26) get uncompressed audio in a QuickTime file
      // instead, which Photos and the social apps accept just the same.
      const audioBitrate = 256_000;
      const hasAac = await canEncodeAudio('aac', { numberOfChannels: channelCount, sampleRate, bitrate: audioBitrate });
      const format = hasAac ? new Mp4OutputFormat({ fastStart: false }) : new MovOutputFormat({ fastStart: false });

      const sink = new BlobSink();
      const writable = new WritableStream({
        write: (chunk) => sink.write(chunk.data, chunk.position)
      });
      output = new Output({
        format,
        target: new StreamTarget(writable, { chunked: true, chunkSize: 8 * 1024 * 1024 })
      });

      const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: videoBitrate, keyFrameInterval: 2 });
      output.addVideoTrack(videoSource, { frameRate: fps });

      const audioSource = new AudioBufferSource(hasAac ? { codec: 'aac', bitrate: audioBitrate } : { codec: 'pcm-s16' });
      output.addAudioTrack(audioSource);

      await output.start();

      // Trails fade once per rendered frame; at 30 FPS each frame has to fade
      // twice as much to leave a trail of the same length
      afterimageDamp.value = Math.pow(originalDamp, ticksPerFrame);

      // The simulated clock starts at the real time, so time-based motion
      // (auto camera, hue drift) continues from where the preview was
      const baseNow = Date.now();
      const analyser = new OfflineAnalyser(audioBuffer);
      effectController.resetTransientState();
      audioManager.resetAnalysis();
      for (let i = PREROLL_TICKS; i > 0; i--) {
        audioManager.updateOffline(analyser, start - i / SIM_RATE, baseNow - i * tickMs);
      }

      const startSample = Math.round(start * sampleRate);
      const endSample = Math.min(audioBuffer.length, startSample + Math.round(length * sampleRate));
      let audioCursor = startSample;
      let lastYield = performance.now();

      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.cancelRequested) {
          await output.cancel();
          return null;
        }

        for (let k = 0; k < ticksPerFrame; k++) {
          const tick = frame * ticksPerFrame + k;
          const now = baseNow + tick * tickMs;
          audioManager.updateOffline(analyser, start + tick / SIM_RATE, now);
          rendererManager.step(now, audioManager.getAudioData());
        }

        postProcessor.render(baseNow + frame * ticksPerFrame * tickMs, 1 / fps);
        await videoSource.add(frame / fps, 1 / fps);

        // Feed audio a second at a time, alongside the video it belongs to
        if (frame % fps === 0 && audioCursor < endSample) {
          const chunkEnd = Math.min(endSample, audioCursor + sampleRate);
          const chunk = new AudioBuffer({ length: chunkEnd - audioCursor, numberOfChannels: channelCount, sampleRate });
          for (let c = 0; c < channelCount; c++) {
            chunk.copyToChannel(audioBuffer.getChannelData(c).subarray(audioCursor, chunkEnd), c);
          }
          await audioSource.add(chunk);
          audioCursor = chunkEnd;
        }

        // Let the page repaint (preview + progress bar) and handle taps
        if (performance.now() - lastYield > 100) {
          if (onProgress) onProgress(frame / totalFrames);
          await yieldToBrowser();
          lastYield = performance.now();
        }
      }

      await output.finalize();
      if (onProgress) onProgress(1);

      return {
        blob: sink.toBlob(format.mimeType),
        filename: `glitch-visualizer-export${format.fileExtension}`
      };
    } catch (e) {
      if (output && output.state === 'started') await output.cancel().catch(() => {});
      throw e;
    } finally {
      afterimageDamp.value = originalDamp;
      effectController.resetTransientState();
      audioManager.resetAnalysis();
      recorder.releaseWakeLock();
      rendererManager.isExporting = false;
      this.isExporting = false;
    }
  }
}
