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
import LivePhotoMaker from '../vendor/livephoto.js';

// Scene updates per second of video. The preview advances motion once per
// display frame (60 Hz), so the export simulates at the same rate to move
// identically — a 30 FPS export runs two updates per rendered frame.
const SIM_RATE = 60;

// Analysis run-in before the first frame, so smoothing and beat history are
// already warm when a clip starts mid-song
const PREROLL_TICKS = SIM_RATE;

// Seamless loops dissolve their last second into the moments just before
// their first frame, so the end flows back into the start
const LOOP_FADE_SECONDS = 1;

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
  // (both in seconds; duration null = to the end). With `loop`, render a
  // silent, seamlessly repeating clip of `duration` seconds instead — no track
  // needed. With `livePhoto`, render a short silent clip and package it as an
  // iOS Live Photo (a paired JPEG + MOV). Resolves with
  // { files: [{ blob, filename }] }, or null if cancelled. onProgress gets 0..1.
  // `loopStyle` picks how loops and Live Photos hide the restart: 'dissolve'
  // or 'bounce' (forward, then the same frames in reverse).
  async export({ startTime = 0, duration = null, loop = false, livePhoto = false, loopStyle = 'dissolve', onProgress = null } = {}) {
    if (this.isExporting) return null;

    const { rendererManager, audioManager, effectController, postProcessor, recorder } = this.app;
    if (!loop && !livePhoto && !audioManager?.file) throw new ExportError('Load a track first.');

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
      if (loop || livePhoto) {
        const clip = await this.renderLoop({
          duration, fps, videoBitrate, onProgress,
          style: loopStyle,
          wantStill: livePhoto,
          setOutput: (o) => { output = o; }
        });
        if (!clip) return null;
        if (!livePhoto) return { files: [{ blob: clip.blob, filename: clip.filename }] };

        // Photos pairs the two files through a shared identifier written into
        // both; the still is the frame the Lock Screen shows at rest
        const live = await LivePhotoMaker.makeLivePhoto(clip.blob, { stillTime: clip.stillTime, photo: clip.still });
        return {
          files: [
            { blob: live.photo, filename: 'glitch-visualizer-live.JPG' },
            { blob: live.video, filename: 'glitch-visualizer-live.MOV' }
          ]
        };
      }

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
        files: [{ blob: sink.toBlob(format.mimeType), filename: `glitch-visualizer-export${format.fileExtension}` }]
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

  // Silent clip without a track that repeats without a visible restart.
  // 'dissolve': frames from just before the start are kept (compressed) and
  // faded over the final second, so the last frame leads straight back into
  // the first. 'bounce': the first half is rendered, then replayed backwards.
  // `wantStill` also returns the middle frame as a JPEG. Runs inside
  // export()'s setup and teardown.
  async renderLoop({ duration, fps, videoBitrate, onProgress, setOutput, style = 'dissolve', wantStill = false }) {
    const { rendererManager, effectController, postProcessor } = this.app;
    const canvas = rendererManager.renderer.domElement;
    const ticksPerFrame = SIM_RATE / fps;
    const tickMs = 1000 / SIM_RATE;

    const totalFrames = Math.round(duration * fps);
    const isBounce = style === 'bounce';
    const fadeFrames = isBounce ? 0 : Math.min(Math.round(LOOP_FADE_SECONDS * fps), Math.floor(totalFrames / 2));
    // A bounce plays frames 0..turn forward, then turn-1..1 backwards, so
    // neither end frame is shown twice in a row
    const turnFrame = Math.floor(totalFrames / 2);
    const stillFrame = Math.floor(totalFrames / 2);
    let still = null;

    // The dissolve is composited on a 2D canvas, which is what gets encoded
    const composite = document.createElement('canvas');
    composite.width = canvas.width;
    composite.height = canvas.height;
    const ctx = composite.getContext('2d');

    const sink = new BlobSink();
    const format = new Mp4OutputFormat({ fastStart: false });
    const output = new Output({
      format,
      target: new StreamTarget(new WritableStream({
        write: (chunk) => sink.write(chunk.data, chunk.position)
      }), { chunked: true, chunkSize: 8 * 1024 * 1024 })
    });
    setOutput(output);

    const videoSource = new CanvasSource(composite, { codec: 'avc', bitrate: videoBitrate, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    await output.start();

    const afterimageDamp = postProcessor.afterimagePass.uniforms['damp'];
    afterimageDamp.value = Math.pow(afterimageDamp.value, ticksPerFrame);

    const baseNow = Date.now();
    effectController.resetTransientState();

    // Frame numbers run from -fadeFrames (the lead-in) to totalFrames - 1
    const renderFrame = (frame) => {
      for (let k = 0; k < ticksPerFrame; k++) {
        rendererManager.step(baseNow + (frame * ticksPerFrame + k) * tickMs, null);
      }
      postProcessor.render(baseNow + frame * ticksPerFrame * tickMs, 1 / fps);
    };

    const totalWork = fadeFrames + totalFrames;
    let lastYield = performance.now();
    const checkpoint = async (done) => {
      if (this.cancelRequested) {
        await output.cancel();
        return false;
      }
      if (performance.now() - lastYield > 100) {
        if (onProgress) onProgress(done / totalWork);
        await yieldToBrowser();
        lastYield = performance.now();
      }
      return true;
    };

    // Frames that are needed again later are stored as high-quality JPEGs —
    // raw 4K frames would not fit in a phone's memory
    const snapshot = (source) => new Promise((resolve) => source.toBlob(resolve, 'image/jpeg', 0.95));
    const drawStored = async (blob, alpha) => {
      const bitmap = await createImageBitmap(blob);
      ctx.globalAlpha = alpha;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    };

    const leadIn = [];
    for (let i = 0; i < fadeFrames; i++) {
      if (!(await checkpoint(i))) return null;
      renderFrame(i - fadeFrames);
      leadIn.push(await snapshot(canvas));
    }

    const forward = []; // bounce only: frames to replay in reverse
    for (let frame = 0; frame < totalFrames; frame++) {
      if (!(await checkpoint(fadeFrames + frame))) return null;

      if (isBounce && frame > turnFrame) {
        const mirrored = 2 * turnFrame - frame;
        await drawStored(forward[mirrored], 1);
        forward[mirrored] = null;
      } else {
        renderFrame(frame);
        ctx.globalAlpha = 1;
        ctx.drawImage(canvas, 0, 0);
        if (isBounce && frame > 0 && frame < turnFrame) forward[frame] = await snapshot(canvas);
      }

      const fadeIndex = frame - (totalFrames - fadeFrames);
      if (fadeFrames > 0 && fadeIndex >= 0) {
        await drawStored(leadIn[fadeIndex], (fadeIndex + 1) / (fadeFrames + 1));
      }

      if (wantStill && frame === stillFrame) {
        still = await new Promise((resolve) => composite.toBlob(resolve, 'image/jpeg', 1));
      }

      await videoSource.add(frame / fps, 1 / fps);
    }

    await output.finalize();
    if (onProgress) onProgress(1);

    return {
      blob: sink.toBlob(format.mimeType),
      filename: `glitch-visualizer-loop${format.fileExtension}`,
      still,
      stillTime: stillFrame / fps
    };
  }
}
