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

        // Dedicated analyser for beat detection — the main analyser's
        // smoothingTimeConstant flattens kick transients too much to detect
        this.beatAnalyser = null;
        this.beatData = null;

        // Adaptive beat detection state (kick detection on raw bass energy)
        this.beat = {
            history: [],     // {t, e} raw bass samples over the last ~1s
            lastBeatTime: 0,
            intervals: [],   // recent inter-beat intervals (ms) for BPM
            bpm: 0,
            strength: 0,     // instant/average energy ratio at the last beat
            isBeat: false,   // true only on the frame a beat was detected
        };
        this.beatCallbacks = []; // push (strength, bpm) => {} to subscribe
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

        // Fast-attack analyser for onset/beat detection. The default byte
        // range tops out at -30dB, which saturates on loud masters and erases
        // kick transients — widen it to keep headroom up to 0dBFS.
        this.beatAnalyser = this.audioContext.createAnalyser();
        this.beatAnalyser.fftSize = 256;
        this.beatAnalyser.smoothingTimeConstant = 0.15;
        this.beatAnalyser.minDecibels = -70;
        this.beatAnalyser.maxDecibels = 0;
        this.beatData = new Uint8Array(this.beatAnalyser.frequencyBinCount);

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

        // Source -> Beat Analyser (analysis only, not routed to output)
        this.sourceNode.connect(this.beatAnalyser);
        
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

        // Beat detection reads the fast-attack analyser (bins 0-5 = lows)
        if (this.beatAnalyser) {
            this.beatAnalyser.getByteFrequencyData(this.beatData);
            let sum = 0;
            for (let i = 0; i < 5; i++) sum += this.beatData[i];
            this._detectBeat(sum / (5 * 255), Date.now());
        }
    }

    // Adaptive kick detection: a beat is an instant bass spike well above the
    // rolling local average, so it tracks the mix's own level instead of a
    // fixed absolute threshold. Variance tightens the ratio on steady material.
    _detectBeat(rawBass, now) {
        const beat = this.beat;
        beat.isBeat = false;

        const history = beat.history;
        history.push({ t: now, e: rawBass });
        while (history.length && now - history[0].t > 1000) history.shift();
        if (history.length < 20) return;

        let avg = 0;
        for (const s of history) avg += s.e;
        avg /= history.length;

        let variance = 0;
        for (const s of history) variance += (s.e - avg) * (s.e - avg);
        variance /= history.length;

        // A beat is a statistical outlier: clearly above the local mean by
        // 1.5 standard deviations. The ratio floor guards against firing on
        // tiny wiggles when the material is very steady (low variance).
        const threshold = Math.max(avg + 1.5 * Math.sqrt(variance), avg * 1.15);
        const refractoryMs = 250; // caps detection at ~240 BPM

        if (rawBass > 0.05 && rawBass > threshold && now - beat.lastBeatTime > refractoryMs) {
            const interval = now - beat.lastBeatTime;
            beat.lastBeatTime = now;
            beat.isBeat = true;
            beat.strength = avg > 0 ? rawBass / avg : 1;

            // BPM from the median of recent inter-beat intervals
            if (interval < 2000) {
                beat.intervals.push(interval);
                if (beat.intervals.length > 8) beat.intervals.shift();
                const sorted = [...beat.intervals].sort((a, b) => a - b);
                beat.bpm = Math.round(60000 / sorted[Math.floor(sorted.length / 2)]);
            }

            this.beatCallbacks.forEach(cb => cb(beat.strength, beat.bpm));
        }
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
