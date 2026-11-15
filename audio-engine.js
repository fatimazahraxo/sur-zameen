/**
 * Sur Zameen - Audio Engine (Tone.js)
 * NASA Space Apps Challenge 2026: The Earth Information Jukebox
 * 
 * Deterministic sonification using South Asian Classical Raags in Just Intonation.
 * Mathematically maps normalized planetary data [0, 1] to pure acoustic ratios.
 */

// Just Intonation frequency ratios relative to Sa (1/1)
export const RAAG_SCALES = {
  yaman: {
    name: 'Raag Yaman',
    time: 'First prahar of night (evening) - represents glowing city lights',
    baseSa: 138.591, // C#3 (Traditional sitar / tanpura tonic)
    // Degrees in one octave
    degrees: [
      { name: 'Sa', ratio: 1 / 1, symbol: 'S' },
      { name: 'Re', ratio: 9 / 8, symbol: 'R' },           // Chatushruti Rishabh (Major second)
      { name: 'Ga', ratio: 5 / 4, symbol: 'G' },           // Shuddha Gandhar (Pure major third)
      { name: 'Ma (tivra)', ratio: 45 / 32, symbol: 'M\'' },// Tivra Madhyam (Augmented fourth)
      { name: 'Pa', ratio: 3 / 2, symbol: 'P' },           // Pancham (Pure fifth)
      { name: 'Dha', ratio: 5 / 3, symbol: 'D' },          // Shuddha Dhaivat (Pure major sixth)
      { name: 'Ni', ratio: 15 / 8, symbol: 'N' }           // Shuddha Nishad (Pure major seventh)
    ]
  },
  bhairavi: {
    name: 'Raag Bhairavi',
    time: 'Dawn / all-day concluding raag - meditative and expressive',
    baseSa: 138.591,
    degrees: [
      { name: 'Sa', ratio: 1 / 1, symbol: 'S' },
      { name: 'Re (komal)', ratio: 16 / 15, symbol: 'r' }, // Komal Rishabh (Minor second)
      { name: 'Ga (komal)', ratio: 6 / 5, symbol: 'g' },   // Komal Gandhar (Minor third)
      { name: 'Ma', ratio: 4 / 3, symbol: 'M' },           // Shuddha Madhyam (Pure fourth)
      { name: 'Pa', ratio: 3 / 2, symbol: 'P' },           // Pancham (Pure fifth)
      { name: 'Dha (komal)', ratio: 8 / 5, symbol: 'd' },  // Komal Dhaivat (Minor sixth)
      { name: 'Ni (komal)', ratio: 9 / 5, symbol: 'n' }    // Komal Nishad (Minor seventh)
    ]
  }
};

export class SurZameenAudioEngine {
  constructor(options = {}) {
    this.currentRaagKey = options.raag || 'yaman';
    this.baseSa = options.baseSa || RAAG_SCALES[this.currentRaagKey].baseSa;
    this.meendTime = options.meendTime || 0.18; // Gliding duration in seconds
    this.isStarted = false;
    this.lastFrequency = null;

    // State tracking for single persistent melody voice
    this.isMelodyActive = false;
    this.silentTime = 0;

    // Build the full scale moved up one octave for melodic clarity
    this.rebuildScaleTable();

    // Nodes
    this.reverb = null;
    this.masterGain = null;
    this.tanpuraDrone = null;
    this.melodyVoice = null;
    this.melodyVibrato = null;
    this.isDronePlaying = false;
  }

  /**
   * Generates lookup table of notes across octaves in Just Intonation.
   * Shifted up one octave: Mandra starts at 1.0x (138.59 Hz), Madhya at 2.0x, Taar at 4.0x.
   */
  rebuildScaleTable() {
    const raag = RAAG_SCALES[this.currentRaagKey];
    this.scaleTable = [];

    const octaveLabels = [
      { label: 'Mandra (Lower)', mult: 1.0 },
      { label: 'Madhya (Middle)', mult: 2.0 },
      { label: 'Taar (Upper)', mult: 4.0 }
    ];

    octaveLabels.forEach((oct) => {
      raag.degrees.forEach((deg) => {
        const freq = this.baseSa * deg.ratio * oct.mult;
        this.scaleTable.push({
          octaveLabel: oct.label,
          octaveMultiplier: oct.mult,
          degreeName: deg.name,
          symbol: deg.symbol,
          ratioFraction: deg.ratio,
          frequencyHz: freq,
          centsFromSa: Math.round(1200 * Math.log2(deg.ratio * oct.mult))
        });
      });
    });

    // Add Taar Sa at top for melodic closure
    const topSa = this.baseSa * 8.0;
    this.scaleTable.push({
      octaveLabel: 'Taar (Upper Closure)',
      octaveMultiplier: 8.0,
      degreeName: 'Sa (High)',
      symbol: 'S\'',
      ratioFraction: 8.0,
      frequencyHz: topSa,
      centsFromSa: Math.round(1200 * Math.log2(8.0))
    });
  }

  /**
   * Must be called in response to a user interaction (click/touch) to resume Tone AudioContext
   */
  async init() {
    if (this.isStarted) return;
    await Tone.start();

    // Master bus with subtle limiter
    this.masterGain = new Tone.Gain(0.85).toDestination();

    // Light reverb simulating an acoustic hall
    this.reverb = new Tone.Reverb({
      decay: 2.6,
      preDelay: 0.02,
      wet: 0.25
    }).connect(this.masterGain);
    await this.reverb.generate();

    this.setupDrone();
    this.setupMelodyVoice();

    this.isStarted = true;
  }

  /**
   * Sets up tanpura drone on Sa and Pa using harmonically rich oscillators
   * Drone remains grounded in the low/baritone acoustic register
   */
  setupDrone() {
    const droneGain = new Tone.Gain(0.22).connect(this.reverb);

    // Warm lowpass filter to simulate tanpura gourd body
    const droneFilter = new Tone.Filter({
      frequency: 1100,
      type: 'lowpass',
      rolloff: -24
    }).connect(droneGain);

    // Sa string (Madhya tonic - 138.59 Hz)
    this.droneSa = new Tone.FatOscillator({
      frequency: this.baseSa,
      type: 'sawtooth',
      spread: 12,
      count: 3
    }).connect(droneFilter);

    // Pa string (Pancham 3/2 in mandra saptak - 103.94 Hz)
    const paFreq = this.baseSa * (3 / 4);
    this.dronePa = new Tone.FatOscillator({
      frequency: paFreq,
      type: 'triangle',
      spread: 8,
      count: 3
    }).connect(droneFilter);

    // Kharaj Sa (Deep bass foundation - 69.3 Hz)
    this.droneBassSa = new Tone.Oscillator({
      frequency: this.baseSa * 0.5,
      type: 'sine'
    }).connect(droneFilter);

    this.droneGainNode = droneGain;
  }

  /**
   * Sets up persistent melody voice:
   * - Triangle wave oscillator for flute/wooden-like purity
   * - Light Tone.Vibrato (5 Hz, small depth) for organic micro-intonation
   * - Soft lowpass filter (low Q, smooth rolloff)
   * - One persistent voice configured for seamless meend (portamento)
   */
  setupMelodyVoice() {
    // 5 Hz light vibrato for subtle acoustic nuance
    this.melodyVibrato = new Tone.Vibrato({
      frequency: 5,
      depth: 0.10,
      type: 'sine'
    }).connect(this.reverb);

    // Single persistent MonoSynth
    this.melodyVoice = new Tone.MonoSynth({
      volume: -2,
      portamento: this.meendTime,
      oscillator: {
        type: 'triangle' // Pure, flute/wooden acoustic warmth
      },
      filter: {
        Q: 1.0,          // Soft lowpass without resonant spike
        type: 'lowpass',
        rolloff: -12
      },
      envelope: {
        attack: 0.04,    // Gentle pluck/breath onset
        decay: 0.35,
        sustain: 0.6,    // Singing body for meend
        release: 0.5     // Clean natural decay
      },
      filterEnvelope: {
        attack: 0.04,
        decay: 0.3,
        sustain: 0.6,
        release: 0.5,
        baseFrequency: 500,
        octaves: 2.2     // Soft filter sweep
      }
    }).connect(this.melodyVibrato);

    // Plucked string fallback
    this.pluckFallback = new Tone.PluckSynth({
      attackNoise: 0.8,
      dampening: 3800,
      resonance: 0.92
    }).connect(this.reverb);
  }

  /**
   * Option to hook up external Sampler if needed
   */
  loadCustomSampler(sampleMap, baseUrl = '') {
    return new Promise((resolve) => {
      this.sampler = new Tone.Sampler({
        urls: sampleMap,
        baseUrl: baseUrl,
        onload: () => {
          this.sampler.connect(this.melodyVibrato);
          resolve(true);
        },
        onerror: (err) => {
          console.warn('Sampler failed to load, falling back to algorithmic synth:', err);
          resolve(false);
        }
      });
    });
  }

  /**
   * Start or stop constant Tanpura drone
   */
  toggleDrone(start) {
    if (!this.isStarted) return;
    const shouldPlay = (start !== undefined) ? start : !this.isDronePlaying;

    if (shouldPlay && !this.isDronePlaying) {
      const now = Tone.now();
      this.droneSa.start(now);
      this.dronePa.start(now + 0.1);
      this.droneBassSa.start(now + 0.2);
      this.droneGainNode.gain.rampTo(0.22, 1.5);
      this.isDronePlaying = true;
    } else if (!shouldPlay && this.isDronePlaying) {
      this.droneGainNode.gain.rampTo(0.001, 1.0);
      const stopTime = Tone.now() + 1.1;
      this.droneSa.stop(stopTime);
      this.dronePa.stop(stopTime);
      this.droneBassSa.stop(stopTime);
      this.isDronePlaying = false;
    }
    return this.isDronePlaying;
  }

  /**
   * Quantizes a normalized data value [0.0, 1.0] to the nearest note in the scale table.
   * Deterministic: identical data values always yield identical notes.
   */
  quantizeDataToScale(normalizedValue) {
    const clamped = Math.max(0, Math.min(1, Number(normalizedValue) || 0));
    const index = Math.round(clamped * (this.scaleTable.length - 1));
    return {
      index,
      dataValue: clamped,
      ...this.scaleTable[index]
    };
  }

  /**
   * Plays a note derived from a data value with authentic Hindustani meend (glide).
   * Uses one persistent melody voice, ramps frequency with rampTo(glideTime),
   * retriggers only if the voice is currently silent, and always schedules triggerRelease.
   *
   * @param {number} normalizedValue - Floating point number [0, 1]
   * @param {Object} options - duration ('4n', '8n', or seconds), velocity, glideTime
   * @returns {Object} Info object describing the note
   */
  playNoteFromData(normalizedValue, options = {}) {
    if (!this.isStarted || !this.melodyVoice) return null;

    const noteInfo = this.quantizeDataToScale(normalizedValue);
    const targetFreq = noteInfo.frequencyHz;
    const duration = options.duration || '4n';
    const velocity = options.velocity !== undefined ? options.velocity : 0.75;
    const glideTime = options.glideTime !== undefined ? options.glideTime : this.meendTime;

    const now = Tone.now();
    const durSec = typeof duration === 'number' ? duration : Tone.Time(duration).toSeconds();
    const releaseTime = now + durSec;

    // Detect if the voice is currently silent
    const isSilent = !this.isMelodyActive || (now >= this.silentTime) || (this.melodyVoice.envelope.value < 0.01);

    // Cancel any previous scheduled release to allow continuous meend
    this.melodyVoice.envelope.cancel(now);

    if (isSilent) {
      // Voice was silent: set target frequency and trigger attack
      this.melodyVoice.frequency.setValueAtTime(targetFreq, now);
      this.melodyVoice.triggerAttack(targetFreq, now, velocity);
      this.isMelodyActive = true;
    } else {
      // Voice is already sounding: smoothly glide frequency to new note without retriggering attack
      this.melodyVoice.frequency.rampTo(targetFreq, glideTime, now);
    }

    // Always schedule release after the note duration
    this.melodyVoice.triggerRelease(releaseTime);

    // Track when the release envelope completes
    const releaseEnvelopeSec = Tone.Time(this.melodyVoice.envelope.release).toSeconds();
    this.silentTime = releaseTime + releaseEnvelopeSec;
    this.lastFrequency = targetFreq;

    return noteInfo;
  }

  /**
   * Stops melody voice immediately or gently decays through release phase
   * Prevents any hanging notes
   */
  stopMelody(immediate = false) {
    if (!this.isStarted || !this.melodyVoice) return;
    const now = Tone.now();
    this.melodyVoice.envelope.cancel(now);

    if (immediate) {
      this.melodyVoice.envelope.setValueAtTime(0, now);
    } else {
      this.melodyVoice.triggerRelease(now);
    }

    this.isMelodyActive = false;
    this.silentTime = immediate ? now : (now + Tone.Time(this.melodyVoice.envelope.release).toSeconds());
    this.lastFrequency = null;
  }

  /**
   * Switch between Yaman and Bhairavi on the fly
   */
  setRaag(raagKey) {
    if (!RAAG_SCALES[raagKey]) {
      throw new Error(`Unknown raag: ${raagKey}. Available: ${Object.keys(RAAG_SCALES).join(', ')}`);
    }
    this.currentRaagKey = raagKey;
    this.baseSa = RAAG_SCALES[raagKey].baseSa;
    this.rebuildScaleTable();

    // Update drone frequencies
    if (this.isDronePlaying) {
      const now = Tone.now();
      this.droneSa.frequency.rampTo(this.baseSa, 0.5, now);
      this.dronePa.frequency.rampTo(this.baseSa * 0.75, 0.5, now);
      this.droneBassSa.frequency.rampTo(this.baseSa * 0.5, 0.5, now);
    }

    return RAAG_SCALES[raagKey];
  }

  getRaagDetails() {
    return RAAG_SCALES[this.currentRaagKey];
  }
}
