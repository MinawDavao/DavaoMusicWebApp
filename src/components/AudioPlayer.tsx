import React, { useState, useEffect, useRef } from 'react';
import { Track } from '../types';
import { audioEngine } from '../utils/audioSynth';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Disc, 
  Radio, 
  Sparkles, 
  ChevronUp,
  ChevronDown,
  X,
  Share2,
  Sliders,
  Music2
} from 'lucide-react';

interface AudioPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
}) => {
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const progressTimerRef = useRef<number | null>(null);

  // Sync with Web Audio synthesizer
  useEffect(() => {
    if (isPlaying) {
      audioEngine.playTrack(currentTrack.synthPreset);
      progressTimerRef.current = window.setInterval(() => {
        setCurrentTimeSec((prev) => {
          if (prev >= currentTrack.durationSec) {
            onNextTrack();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      audioEngine.pause();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [isPlaying, currentTrack]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    audioEngine.setVolume(val);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      audioEngine.setVolume(volume || 0.5);
    } else {
      setIsMuted(true);
      audioEngine.setVolume(0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekSec = parseInt(e.target.value, 10);
    setCurrentTimeSec(seekSec);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = (currentTimeSec / currentTrack.durationSec) * 100;

  return (
    <>
      {/* 1. Mobile Floating / Docked Player Bar (Positioned above bottom nav) */}
      <aside 
        aria-label="Audio player dock" 
        className="fixed bottom-14 left-0 right-0 z-40 mx-auto max-w-lg px-2 sm:px-3 pointer-events-none"
      >
        <div className="pointer-events-auto bg-[#161B20]/95 backdrop-blur-2xl border border-[#EBEBED]/12 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(96,69,244,0.25)] overflow-hidden transition-all duration-300">
          {/* Top subtle progress line */}
          <div className="w-full bg-[#252D37] h-0.5 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#6045F4] to-[#53E6D4] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="px-3 py-2 flex items-center justify-between gap-2.5">
            {/* Left: Tap to open full sheet */}
            <div 
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
              title="Tap for Now Playing details"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.title}
                  className={`w-10 h-10 rounded-xl object-cover border border-[#EBEBED]/15 transition-transform group-hover:scale-105 ${
                    isPlaying ? 'ring-2 ring-[#6045F4] shadow-[0_0_10px_rgba(96,69,244,0.5)]' : ''
                  }`}
                />
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center">
                    <Disc className="w-4 h-4 text-[#53E6D4] animate-spin" style={{ animationDuration: '3.5s' }} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate group-hover:text-[#53E6D4] transition-colors">
                  {currentTrack.title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#8E9AA7] truncate">
                  <span className="truncate">{currentTrack.artist}</span>
                  <span>•</span>
                  <span className={isPlaying ? "text-[#53E6D4] font-semibold" : "text-[#FFB800]"}>
                    {isPlaying ? "Playing" : "Ready"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Audio Controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onPrevTrack}
                id="player-prev-btn"
                className="text-slate-400 hover:text-white p-1.5 transition-colors cursor-pointer"
                title="Previous Track"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={onTogglePlay}
                id="player-play-btn"
                className="w-9 h-9 rounded-full bg-[#6045F4] hover:bg-[#7A62FF] text-white flex items-center justify-center shadow-[0_0_15px_rgba(96,69,244,0.6)] transition-all transform active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play Track'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current translate-x-0.5" />
                )}
              </button>

              <button
                onClick={onNextTrack}
                id="player-next-btn"
                className="text-slate-400 hover:text-white p-1.5 transition-colors cursor-pointer"
                title="Next Track"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsExpanded(true)}
                className="text-slate-400 hover:text-white p-1 transition-colors ml-0.5 cursor-pointer"
                title="Expand Now Playing"
              >
                <ChevronUp className="w-4 h-4 text-[#53E6D4]" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Full-Screen / Bottom Sheet Mobile Now Playing Drawer */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-[#0F1417]/95 backdrop-blur-2xl flex flex-col justify-between p-5 animate-in slide-in-from-bottom duration-300 max-w-md mx-auto">
          {/* Top Drawer Bar */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 rounded-full bg-white/5 text-slate-300 hover:text-white border border-white/10 cursor-pointer"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-[10px] uppercase tracking-widest text-[#53E6D4] font-semibold">
                Davao Soundstage
              </span>
              <h4 className="text-xs font-bold text-white">Now Playing</h4>
            </div>

            <div className="w-9 h-9 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 flex items-center justify-center">
              <Music2 className="w-4 h-4 text-[#53E6D4]" />
            </div>
          </div>

          {/* Vinyl & Artwork Centerpiece */}
          <div className="my-auto py-4 flex flex-col items-center">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-[#161B20] border-4 border-[#252D37] flex items-center justify-center shadow-2xl vinyl-grooves">
              {/* Spinning Disc */}
              <div 
                className={`w-full h-full rounded-full flex items-center justify-center p-8 ${isPlaying ? 'animate-spin' : ''}`}
                style={{ animationDuration: '6s' }}
              >
                <img
                  src={currentTrack.albumArt}
                  alt={currentTrack.title}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-[#0F1417] shadow-xl"
                />
              </div>

              {/* Center spindle */}
              <div className="absolute w-6 h-6 rounded-full bg-[#0F1417] border-2 border-[#53E6D4] flex items-center justify-center pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>

            {/* Title & Artist */}
            <div className="mt-6 text-center w-full px-4">
              <h2 className="text-lg sm:text-xl font-heading font-extrabold text-white truncate">
                {currentTrack.title}
              </h2>
              <p className="text-sm font-medium text-[#53E6D4] mt-0.5">
                {currentTrack.artist}
              </p>
              <span className="inline-block mt-2 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#EBEBED]">
                {currentTrack.genre}
              </span>
            </div>

            {/* Davao Studio Liner Note */}
            {currentTrack.lyricsSnippet && (
              <p className="mt-3 text-[11px] text-slate-400 italic max-w-xs text-center px-4">
                "{currentTrack.lyricsSnippet}"
              </p>
            )}
          </div>

          {/* Scrub Bar & Controls */}
          <div className="space-y-4 pb-2">
            {/* Progress Slider */}
            <div>
              <input
                type="range"
                min="0"
                max={currentTrack.durationSec}
                value={currentTimeSec}
                onChange={handleSeek}
                className="w-full h-1.5 bg-[#252D37] rounded-lg appearance-none cursor-pointer accent-[#53E6D4]"
              />
              <div className="flex justify-between text-[11px] font-mono text-[#8E9AA7] mt-1.5">
                <span>{formatTime(currentTimeSec)}</span>
                <span>{currentTrack.duration}</span>
              </div>
            </div>

            {/* Big Action Buttons */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={onPrevTrack}
                className="text-slate-300 hover:text-white p-2 transition-transform active:scale-90 cursor-pointer"
              >
                <SkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={onTogglePlay}
                className="w-14 h-14 rounded-full bg-[#6045F4] hover:bg-[#7A62FF] text-white flex items-center justify-center shadow-[0_0_25px_rgba(96,69,244,0.6)] transition-all transform active:scale-95 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current translate-x-0.5" />
                )}
              </button>

              <button
                onClick={onNextTrack}
                className="text-slate-300 hover:text-white p-2 transition-transform active:scale-90 cursor-pointer"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>

            {/* Volume & Close Drawer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <button onClick={toggleMute} className="text-slate-400 hover:text-white">
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-[#252D37] rounded appearance-none cursor-pointer accent-[#53E6D4]"
                />
              </div>

              <button
                onClick={() => setIsExpanded(false)}
                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
