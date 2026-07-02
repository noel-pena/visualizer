export default class AudioManager {
    constructor() {
        this.audioContext = null;
        this.audioElement = null;
        this.sourceNode = null;
        this.analyser = null;
        this.streamDestination = null;

        this.isPlaying = false;
        this.isLoaded = false;
        
        // Frequency data arrays
        this.dataArray = null;
        this.bufferLength = 0;

        // Current track info
        this.trackName = "No track loaded";
        this.duration = 0;
        this.currentTime = 0;

        // Callbacks
        this.onPlay = null;
        this.onPause = null;
        this.onTimeUpdate = null;
        this.onLoaded = null;
        this.onEnded = null;
        // Smoothed frequency data
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedHigh = 0;
        this.smoothedAvg = 0;
        this.smoothingFactor = 0.85; // 0 = no smoothing, 0.99 = heavily smoothed
    }

    init() {
        if (this.audioContext) return;
        
        // Create context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create analyser
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256; // 128 frequency bins
        // We can also let the analyser do some native smoothing
        this.analyser.smoothingTimeConstant = 0.7; 
        
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        // Create stream destination for recording
        this.streamDestination = this.audioContext.createMediaStreamDestination();

        // Create audio element
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        
        // Hook up audio element events
        this.audioElement.addEventListener('play', () => {
            this.isPlaying = true;
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (this.onPlay) this.onPlay();
        });

        this.audioElement.addEventListener('pause', () => {
            this.isPlaying = false;
            if (this.onPause) this.onPause();
        });

        this.audioElement.addEventListener('timeupdate', () => {
            this.currentTime = this.audioElement.currentTime;
            if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime, this.duration);
        });

        this.audioElement.addEventListener('loadedmetadata', () => {
            this.duration = this.audioElement.duration;
            this.isLoaded = true;
            if (this.onLoaded) this.onLoaded();
        });

        this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            if (this.onEnded) this.onEnded();
        });

        // Connect nodes
        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
        
        // Source -> Analyser
        this.sourceNode.connect(this.analyser);
        
        // Analyser -> Output (Speakers)
        this.analyser.connect(this.audioContext.destination);
        
        // Analyser -> Stream Destination (For Recording)
        this.analyser.connect(this.streamDestination);
    }

    loadFromFile(file) {
        this.init();
        
        if (this.audioElement.src) {
            URL.revokeObjectURL(this.audioElement.src);
        }

        const url = URL.createObjectURL(file);
        this.audioElement.src = url;
        this.trackName = file.name;
        this.audioElement.load();
    }

    play() {
        if (!this.isLoaded) return;
        this.audioElement.play();
    }

    pause() {
        if (!this.isLoaded) return;
        this.audioElement.pause();
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    seek(timeSeconds) {
        if (!this.isLoaded) return;
        this.audioElement.currentTime = timeSeconds;
    }

    update() {
        if (!this.isPlaying || !this.analyser) return;
        
        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate raw values
        const rawBass = this._calculateRawEnergy(0, 5);
        const rawMid = this._calculateRawEnergy(5, 40);
        const rawHigh = this._calculateRawEnergy(40, this.bufferLength);
        const rawAvg = this._calculateRawEnergy(0, this.bufferLength);

        // Apply low-pass filter (interpolation) for smooth, organic movement
        this.smoothedBass = (this.smoothedBass * this.smoothingFactor) + (rawBass * (1 - this.smoothingFactor));
        this.smoothedMid = (this.smoothedMid * this.smoothingFactor) + (rawMid * (1 - this.smoothingFactor));
        this.smoothedHigh = (this.smoothedHigh * this.smoothingFactor) + (rawHigh * (1 - this.smoothingFactor));
        this.smoothedAvg = (this.smoothedAvg * this.smoothingFactor) + (rawAvg * (1 - this.smoothingFactor));
    }

    _calculateRawEnergy(startBin, endBin) {
        if (!this.dataArray) return 0;
        let sum = 0;
        const count = endBin - startBin;
        for (let i = startBin; i < endBin; i++) {
            sum += this.dataArray[i];
        }
        return sum / (count * 255); // Normalized 0-1
    }

    getBassEnergy() {
        return this.smoothedBass;
    }

    getMidEnergy() {
        return this.smoothedMid;
    }

    getHighEnergy() {
        return this.smoothedHigh;
    }

    getAverageEnergy() {
        return this.smoothedAvg;
    }

    getStream() {
        return this.streamDestination ? this.streamDestination.stream : null;
    }
}
