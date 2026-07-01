export class Recorder {
  constructor(app) {
    this.app = app;

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;

    this.isPortraitMode = false;
    this.isTransparentBackground = false;
    this.uploadedImageElement = null; // Store image object for compositing

    this.compositeCanvas = null;
    this.compositeCtx = null;
  }

  init() {
    this.isPortraitMode = document.getElementById('image-orientation-toggle')?.checked ?? false;
    this.isTransparentBackground = document.getElementById('transparent-bg-toggle')?.checked ?? false;
  }

  startRecording() {
    if (this.isRecording) return;

    const renderer = this.app.rendererManager.renderer;
    const recordingDurationInput = document.getElementById('recording-duration');
    const startRecordingButton = document.getElementById('start-recording-button');
    const recordingStatus = document.getElementById('recording-status');

    this.isRecording = true;
    this.recordedChunks = [];

    if (recordingStatus) recordingStatus.classList.remove('hidden');
    if (startRecordingButton) {
      startRecordingButton.disabled = true;
      startRecordingButton.textContent = "Recording...";
    }

    const duration = parseInt(recordingDurationInput?.value || '10') * 1000;

    // --- Setup Composite Recording (BG Image + WebGL) ---
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = renderer.domElement.width;
    this.compositeCanvas.height = renderer.domElement.height;
    this.compositeCtx = this.compositeCanvas.getContext('2d');

    // Capture at 60 FPS for smoother motion
    const stream = this.compositeCanvas.captureStream(60);

    // Smart MIME Type Selection (Prefer MP4, fallback to High Quality WebM)
    const mimeTypes = [
      'video/mp4',             // Safari / Native MP4 support
      'video/webm;codecs=vp9', // High quality Chrome/Firefox
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

    if (!supportedMimeType) {
      console.error("No supported MIME type for MediaRecorder");
      this.isRecording = false;
      if (recordingStatus) recordingStatus.classList.add('hidden');
      if (startRecordingButton) {
        startRecordingButton.disabled = false;
        startRecordingButton.textContent = "Start Recording";
      }
      return;
    }

    const options = {
      mimeType: supportedMimeType,
      videoBitsPerSecond: 25000000 // 25 Mbps
    };

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      console.error("Failed to create MediaRecorder with options:", e);
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const isMp4 = supportedMimeType.includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';

      this.downloadRecording(extension);
      this.isRecording = false;
      if (recordingStatus) recordingStatus.classList.add('hidden');
      if (startRecordingButton) {
        startRecordingButton.disabled = false;
        startRecordingButton.textContent = "Start Recording";
      }

      this.compositeCanvas = null;
      this.compositeCtx = null;
    };

    this.mediaRecorder.start();

    setTimeout(() => {
      if (this.isRecording && this.mediaRecorder) {
        this.mediaRecorder.stop();
      }
    }, duration);
  }

  renderCompositeFrame() {
    const renderer = this.app.rendererManager.renderer;
    if (!this.compositeCtx || !renderer || !renderer.domElement) return;

    const width = this.compositeCanvas.width;
    const height = this.compositeCanvas.height;

    // 1. Draw Background
    if (this.uploadedImageElement && !this.isTransparentBackground) {
      const img = this.uploadedImageElement;
      const imgRatio = img.width / img.height;
      const canvasRatio = width / height;
      let drawWidth, drawHeight, offsetX, offsetY;

      if (imgRatio > canvasRatio) {
        drawHeight = height;
        drawWidth = img.width * (height / img.height);
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = width;
        drawHeight = img.height * (width / img.width);
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      }

      this.compositeCtx.fillStyle = '#111'; // Fallback
      this.compositeCtx.fillRect(0, 0, width, height);
      this.compositeCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      this.compositeCtx.clearRect(0, 0, width, height);
      if (!this.isTransparentBackground) {
        this.compositeCtx.fillStyle = '#000';
        this.compositeCtx.fillRect(0, 0, width, height);
      }
    }

    // 2. Draw WebGL Canvas on top
    this.compositeCtx.drawImage(renderer.domElement, 0, 0);
  }

  downloadRecording(extension = 'webm') {
    const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const filename = `glitch-visualizer-export.${extension}`;
    this.downloadDataURL(url, filename);
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

    try {
      const filename = `glitch-visualizer-${this.isPortraitMode ? 'portrait' : 'landscape'}${this.isTransparentBackground ? '-transparent' : ''}.png`;

      // Create a temporary canvas for composition
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = renderer.domElement.width;
      tempCanvas.height = renderer.domElement.height;
      const ctx = tempCanvas.getContext('2d');

      // 1. Draw Background Image
      if (this.uploadedImageElement && !this.isTransparentBackground) {
        const width = tempCanvas.width;
        const height = tempCanvas.height;
        const img = this.uploadedImageElement;

        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > canvasRatio) {
          drawHeight = height;
          drawWidth = img.width * (height / img.height);
          offsetX = (width - drawWidth) / 2;
          offsetY = 0;
        } else {
          drawWidth = width;
          drawHeight = img.height * (width / img.width);
          offsetX = 0;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      }

      // 2. Draw WebGL Content
      postProcessor.composer.render(); // Fresh render
      ctx.drawImage(renderer.domElement, 0, 0);

      const dataURL = tempCanvas.toDataURL('image/png');
      this.downloadDataURL(dataURL, filename);

    } catch (e) {
      console.error("Error saving image:", e);
    }
  }
}
