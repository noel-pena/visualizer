import { createZip } from './zip.js';

export class Recorder {
  constructor(app) {
    this.app = app;

    this.mediaRecorder = null;
    this.videoStream = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.wakeLock = null;
    this.wantsWakeLock = false; // true while a recording or export is running

    // UI hooks — set by UIController so the recorder never touches the DOM
    this.onStopCallback = null;
    this.onShareReady = null; // (files) => {} — phone exports go through the share sheet
  }

  init() {
    // The screen wake lock is dropped whenever the page is hidden; take it
    // back if we return mid-recording or mid-export
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.wantsWakeLock) this.acquireWakeLock();
    });
  }

  startRecording(audioStream = null) {
    if (this.isRecording) return;

    const canvas = this.app.rendererManager.renderer.domElement;
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    this.isRecording = true;
    this.recordedChunks = [];

    // Capture the visible WebGL canvas directly. The background is part of the
    // scene, so no compositing is needed — and Safari stops delivering frames
    // from a canvas that isn't attached to the page.
    // Phones record at 30 FPS: it halves the encoder's work, and it's what
    // Reels/Shorts play back at anyway.
    const fps = isTouchDevice ? 30 : 60;
    this.videoStream = canvas.captureStream(fps);
    let finalStream = this.videoStream;

    // Multiplex audio and video streams if audio is provided
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        finalStream = new MediaStream([
          ...this.videoStream.getVideoTracks(),
          ...audioTracks
        ]);
      }
    }

    // Smart MIME Type Selection (Prefer MP4, fallback to High Quality WebM)
    const mimeTypes = [
      'video/mp4;codecs=avc1,mp4a.40.2', // H.264 + AAC: plays everywhere, uploads anywhere
      'video/mp4',             // Safari / Native MP4 support
      'video/webm;codecs=vp9,opus', // High quality Chrome/Firefox with audio
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

    if (!supportedMimeType) {
      console.error("No supported MIME type for MediaRecorder");
      this.finishRecording();
      return;
    }

    // Bitrate scales with the frame: ~8 Mbps at 1080p30, ~16 at 1080p60,
    // capped for 4K. The whole recording is held in memory until it's saved,
    // so a fixed high bitrate made full-length songs too big for a phone.
    const videoBitsPerSecond = Math.round(
      Math.min(40_000_000, Math.max(4_000_000, canvas.width * canvas.height * fps * 0.13))
    );

    const options = {
      mimeType: supportedMimeType,
      videoBitsPerSecond,
      audioBitsPerSecond: 256000
    };

    try {
      this.mediaRecorder = new MediaRecorder(finalStream, options);
    } catch (e) {
      console.error("Failed to create MediaRecorder with options:", e);
      this.mediaRecorder = new MediaRecorder(finalStream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event.error || event);
      this.stopRecording();
    };

    this.mediaRecorder.onstop = () => {
      const isMp4 = supportedMimeType.includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';

      this.downloadRecording(extension);
      this.finishRecording();
    };

    // Flush encoded data every second instead of in one piece at the end
    this.mediaRecorder.start(1000);
    this.acquireWakeLock();
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // Shared teardown for every stop path (manual, song end, error)
  finishRecording() {
    this.isRecording = false;
    if (this.videoStream) {
      this.videoStream.getVideoTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    this.releaseWakeLock();
    if (this.onStopCallback) this.onStopCallback();
  }

  // Keep the screen on while recording or exporting — a phone that auto-locks
  // suspends the page and ends the take. Unsupported browsers just skip this.
  async acquireWakeLock() {
    this.wantsWakeLock = true;
    if (!navigator.wakeLock || this.wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
      if (this.wantsWakeLock) this.wakeLock = lock;
      else lock.release();
    } catch (e) {
      console.warn('Screen wake lock unavailable:', e);
    }
  }

  releaseWakeLock() {
    this.wantsWakeLock = false;
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  downloadRecording(extension = 'webm') {
    const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    this.recordedChunks = [];
    this.deliverFile(blob, `glitch-visualizer-export.${extension}`);
  }

  // On phones a download lands in Files (iOS) or a downloads folder; the share
  // sheet offers "Save Video/Image" straight to Photos instead. navigator.share
  // needs a fresh tap, so the UI shows a save button rather than sharing here.
  deliverFile(blob, filename) {
    this.deliverFiles([{ blob, filename }]);
  }

  // Several files at once are saved together (a Live Photo is a photo + video pair)
  deliverFiles(items) {
    const files = items.map(({ blob, filename }) => new File([blob], filename, { type: blob.type }));
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    if (isTouchDevice && this.onShareReady && navigator.canShare?.({ files })) {
      this.onShareReady(files);
      return;
    }

    if (files.length === 1) {
      this.downloadDataURL(URL.createObjectURL(files[0]), files[0].name);
    } else {
      this.downloadAsZip(files);
    }
  }

  // Browsers drop or block all but one of several downloads started together
  // (Safari keeps only the last), so a set of files goes out as a single zip
  async downloadAsZip(files) {
    const entries = await Promise.all(files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer())
    })));
    const name = files[0].name.replace(/\.[^.]+$/, '') + '.zip';
    this.downloadDataURL(URL.createObjectURL(createZip(entries)), name);
  }

  downloadDataURL(dataURL, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      if (dataURL.startsWith('blob:')) {
        window.URL.revokeObjectURL(dataURL);
      }
    }, 100);
  }

  saveImage() {
    const renderer = this.app.rendererManager.renderer;
    const postProcessor = this.app.postProcessor;
    if (!renderer || !postProcessor) return;

    const canvas = renderer.domElement;
    const orientation = canvas.height > canvas.width ? 'portrait' : canvas.height === canvas.width ? 'square' : 'landscape';

    try {
      postProcessor.render(); // Fresh render — the background is part of the scene
      canvas.toBlob((blob) => {
        if (blob) this.deliverFile(blob, `glitch-visualizer-${orientation}.png`);
      }, 'image/png');
    } catch (e) {
      console.error("Error saving image:", e);
    }
  }
}
