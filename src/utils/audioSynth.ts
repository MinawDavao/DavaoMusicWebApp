// Web Audio Synthesizer for live simulated playback in Davao Musika
class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private timerId: number | null = null;
  private currentPreset: string = 'indie';
  private step: number = 0;
  private gainNode: GainNode | null = null;
  private volume: number = 0.7;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public playTrack(preset: 'reggae' | 'indie' | 'synthwave' | 'rock' = 'indie') {
    this.initContext();
    this.currentPreset = preset;
    this.isPlaying = true;
    this.step = 0;

    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
    }

    const interval = preset === 'reggae' ? 240 : preset === 'synthwave' ? 200 : 220;
    this.timerId = window.setInterval(() => {
      this.playNoteStep();
    }, interval);
  }

  private playNoteStep() {
    if (!this.ctx || !this.gainNode || !this.isPlaying) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();

    // Scale frequencies for chords / grooves
    const indieNotes = [261.63, 329.63, 392.00, 493.88, 523.25, 440.00, 349.23, 392.00];
    const reggaeNotes = [130.81, 164.81, 196.00, 220.00, 261.63, 196.00, 164.81, 130.81];
    const synthNotes = [110.00, 130.81, 146.83, 164.81, 220.00, 261.63, 293.66, 329.63];
    const rockNotes = [146.83, 220.00, 293.66, 349.23, 293.66, 220.00, 174.61, 220.00];

    let notes = indieNotes;
    let waveType: OscillatorType = 'triangle';

    if (this.currentPreset === 'reggae') {
      notes = reggaeNotes;
      waveType = 'sine';
    } else if (this.currentPreset === 'synthwave') {
      notes = synthNotes;
      waveType = 'sawtooth';
    } else if (this.currentPreset === 'rock') {
      notes = rockNotes;
      waveType = 'square';
    }

    const freq = notes[this.step % notes.length];
    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, now);

    // Filter to make sound warm and night-market smooth
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.currentPreset === 'rock' ? 800 : 1200, now);

    // Envelope
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.38);

    this.step++;
  }

  public pause() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public stop() {
    this.pause();
    this.step = 0;
  }
}

export const audioEngine = new AudioEngine();
