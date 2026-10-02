import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Track, DavaoArtist } from '../../types';
import { DAVAO_ARTISTS_LIST } from '../../data/mockData';
import { audioEngine } from '../../utils/audioSynth';
import { 
  Radio, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  MapPin, 
  Music, 
  Disc, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  albumArt: string;
  duration: string;
  durationSec: number;
  genre: string;
  district: string;
  synthPreset: 'rock' | 'indie' | 'reggae' | 'synthwave';
  verified?: boolean;
}

interface DavaoRadioCardProps {
  tracks: Track[];
  onSelectArtist: (artistId: string) => void;
  externalPlayingId?: string | null;
  onRadioPlayStateChange?: (isPlaying: boolean) => void;
}

export const DavaoRadioCard: React.FC<DavaoRadioCardProps> = ({
  tracks,
  onSelectArtist,
  externalPlayingId,
  onRadioPlayStateChange,
}) => {
  // 1. Build the complete pool of uploaded audio from all Davao bands
  const radioPool: RadioTrack[] = useMemo(() => {
    const list: RadioTrack[] = [];

    // Tracks passed as props (e.g. Caliber 45, The Marfori Sound, and dynamic uploads)
    tracks.forEach((t) => {
      const isC45 = t.artist.toLowerCase().includes('caliber');
      list.push({
        id: t.id,
        title: t.title,
        artist: t.artist,
        artistId: t.artistId || (isC45 ? 'caliber-45' : 'artist-01'),
        albumArt: t.albumArt,
        duration: t.duration,
        durationSec: t.durationSec || 210,
        genre: t.genre,
        district: isC45 ? 'Matina & Buhangin, Davao City' : 'Marfori Heights / Bajada',
        synthPreset: (t.synthPreset as 'rock' | 'indie' | 'reggae' | 'synthwave') || 'indie',
        verified: true,
      });
    });

    // Uploaded / featured tracks from other local Davao bands
    const artistPresetMap: Record<string, 'rock' | 'indie' | 'reggae' | 'synthwave'> = {
      'artist-02': 'indie',
      'artist-03': 'reggae',
      'artist-04': 'rock',
      'artist-06': 'reggae',
      'artist-07': 'indie',
      'artist-08': 'synthwave',
      'artist-09': 'rock',
      'artist-10': 'indie',
    };

    DAVAO_ARTISTS_LIST.forEach((artist) => {
      // Avoid duplicating Caliber 45 or Marfori tracks already in tracks list
      if (artist.id === 'caliber-45' || artist.id === 'artist-01') return;
      if (!artist.featuredTrackTitle) return;

      const durParts = (artist.featuredTrackDuration || '3:30').split(':');
      const min = parseInt(durParts[0], 10) || 3;
      const sec = parseInt(durParts[1], 10) || 30;
      const durSec = min * 60 + sec;

      list.push({
        id: `band-radio-${artist.id}`,
        title: artist.featuredTrackTitle,
        artist: artist.name,
        artistId: artist.id,
        albumArt: artist.avatar,
        duration: artist.featuredTrackDuration || '3:30',
        durationSec: durSec,
        genre: artist.genre,
        district: artist.district,
        synthPreset: artistPresetMap[artist.id] || 'indie',
        verified: artist.verified,
      });
    });

    return list;
  }, [tracks]);

  // 2. Playback state - CRITICAL: Do NOT autoplay! Let user choose to play or not
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progressSec, setProgressSec] = useState(0);
  const [historyIndices, setHistoryIndices] = useState<number[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  // Equalizer animation bars
  const [visualizerHeights, setVisualizerHeights] = useState<number[]>([20, 45, 75, 30, 90, 60, 40, 85, 55, 30, 65, 80]);

  const currentTrack = radioPool[currentTrackIndex] || radioPool[0];

  // If another component starts playing an inline preview, pause the radio
  useEffect(() => {
    if (externalPlayingId && isPlaying) {
      setIsPlaying(false);
      onRadioPlayStateChange?.(false);
    }
  }, [externalPlayingId, isPlaying, onRadioPlayStateChange]);

  // Pick a random track from the pool, ensuring it's different if possible
  const getRandomIndex = (excludeIndex: number) => {
    if (radioPool.length <= 1) return 0;
    let nextIdx = excludeIndex;
    let attempts = 0;
    while (nextIdx === excludeIndex && attempts < 10) {
      nextIdx = Math.floor(Math.random() * radioPool.length);
      attempts++;
    }
    return nextIdx;
  };

  // Next random song handler
  const handleNextRandomSong = (shouldKeepPlaying = isPlaying) => {
    const nextIdx = getRandomIndex(currentTrackIndex);
    setHistoryIndices((prev) => [...prev.slice(-15), currentTrackIndex]);
    setCurrentTrackIndex(nextIdx);
    setProgressSec(0);

    if (shouldKeepPlaying) {
      const nextTrack = radioPool[nextIdx];
      if (nextTrack) {
        audioEngine.playTrack(nextTrack.synthPreset);
      }
    }
  };

  // Previous song handler
  const handlePrevSong = () => {
    if (historyIndices.length > 0) {
      const lastIdx = historyIndices[historyIndices.length - 1];
      setHistoryIndices((prev) => prev.slice(0, -1));
      setCurrentTrackIndex(lastIdx);
      setProgressSec(0);
      if (isPlaying) {
        const prevTrack = radioPool[lastIdx];
        if (prevTrack) {
          audioEngine.playTrack(prevTrack.synthPreset);
        }
      }
    } else {
      // No history, pick random
      handleNextRandomSong();
    }
  };

  // Explicit user-driven play/pause toggle
  const handleTogglePlay = () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
      onRadioPlayStateChange?.(false);
    } else {
      if (currentTrack) {
        audioEngine.playTrack(currentTrack.synthPreset);
      }
      setIsPlaying(true);
      onRadioPlayStateChange?.(true);
    }
  };

  // Toggle mute
  const handleToggleMute = () => {
    if (isMuted) {
      audioEngine.setVolume(0.7);
      setIsMuted(false);
    } else {
      audioEngine.setVolume(0);
      setIsMuted(true);
    }
  };

  // Timer: Advances elapsed seconds and loops to next random track when song ends
  useEffect(() => {
    let timer: number | null = null;
    let vizTimer: number | null = null;

    if (isPlaying) {
      timer = window.setInterval(() => {
        setProgressSec((prev) => {
          const maxSec = currentTrack?.durationSec || 200;
          if (prev >= maxSec) {
            // Song finished -> auto-play next random song from uploaded band audio!
            handleNextRandomSong(true);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);

      // Animate visualizer frequency bars
      vizTimer = window.setInterval(() => {
        setVisualizerHeights(
          Array.from({ length: 12 }, () => Math.floor(Math.random() * 75) + 20)
        );
      }, 140);
    } else {
      setVisualizerHeights([15, 20, 25, 20, 30, 25, 20, 30, 25, 20, 25, 20]);
    }

    return () => {
      if (timer !== null) clearInterval(timer);
      if (vizTimer !== null) clearInterval(vizTimer);
    };
  }, [isPlaying, currentTrack?.durationSec]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (isPlaying) {
        audioEngine.pause();
      }
    };
  }, [isPlaying]);

  // Progress formatting
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = currentTrack?.durationSec
    ? Math.min(100, (progressSec / currentTrack.durationSec) * 100)
    : 0;

  if (!currentTrack) return null;

  return (
    <div 
      id="davao-radio-card"
      className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#181D24] via-[#14191F] to-[#0F1417] border border-[#6045F4]/40 hover:border-[#6045F4]/70 p-3.5 sm:p-5 shadow-2xl transition-all space-y-3.5 group overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-opacity duration-700 ${
        isPlaying ? 'bg-[#6045F4]/20 opacity-100' : 'bg-[#6045F4]/5 opacity-40'
      }`} />
      <div className={`absolute bottom-0 left-0 w-48 h-48 rounded-full blur-2xl pointer-events-none transition-opacity duration-700 ${
        isPlaying ? 'bg-[#53E6D4]/15 opacity-100' : 'bg-transparent opacity-0'
      }`} />

      {/* ===================================================================== */}
      {/* 1. RADIO HEADER: Station Identity & Live Status Badge                 */}
      {/* ===================================================================== */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all ${
            isPlaying 
              ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.6)] animate-pulse' 
              : 'bg-white/10 text-slate-300'
          }`}>
            <Radio className="w-4 h-4 text-[#53E6D4]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-extrabold uppercase tracking-wider text-xs sm:text-sm text-white truncate">
                DVO Scene Radio
              </span>
              <span className="px-1.5 py-0.2 rounded bg-[#53E6D4]/15 border border-[#53E6D4]/30 text-[#53E6D4] text-[9px] font-mono font-bold uppercase tracking-wider">
                105.9 FM
              </span>
            </div>
            <p className="text-[10px] text-[#8E9AA7] truncate font-mono">
              Homegrown Band Shuffle • {radioPool.length} Uploaded Tracks
            </p>
          </div>
        </div>

        {/* Live / Status Indicator Pill */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold tracking-wider uppercase transition-all ${
            isPlaying 
              ? 'bg-[#53E6D4]/15 border-[#53E6D4]/50 text-[#53E6D4] shadow-[0_0_10px_rgba(83,230,212,0.3)]' 
              : 'bg-white/5 border-white/10 text-slate-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isPlaying ? 'bg-[#53E6D4] animate-ping' : 'bg-slate-500'
            }`} />
            <span>{isPlaying ? 'ON AIR' : 'STANDBY'}</span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. MAIN PLAYER INFO: Album Art, Now Playing, Band Info, Equalizer     */}
      {/* ===================================================================== */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-4">
        
        {/* Album Artwork with Vinyl Rotation Effect when playing */}
        <div className="relative flex-shrink-0 mx-auto sm:mx-0">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-black shadow-xl border border-white/15 group-hover:border-[#6045F4]/60 transition-all">
            <img
              src={currentTrack.albumArt}
              alt={currentTrack.title}
              className={`w-full h-full object-cover transition-transform duration-700 ${
                isPlaying ? 'scale-105' : 'scale-100'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            
            {/* Spinning Disc Badge Overlay */}
            <div className="absolute bottom-1 right-1 p-1 rounded-full bg-black/80 backdrop-blur-sm border border-white/20">
              <Disc className={`w-3.5 h-3.5 text-[#53E6D4] ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
            </div>
          </div>
        </div>

        {/* Track & Band Details */}
        <div className="min-w-0 flex-1 w-full space-y-1.5 text-center sm:text-left">
          
          {/* "Now Playing" Broadcast Tag */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
            <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-[#A78BFA] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#53E6D4]" />
              {isPlaying ? 'Now Playing' : 'Queued Track'}
            </span>
            <span className="text-[10px] text-slate-500">•</span>
            <span className="px-2 py-0.2 rounded bg-[#6045F4]/30 border border-[#6045F4]/40 text-white text-[9.5px] font-semibold">
              {currentTrack.genre}
            </span>
          </div>

          {/* Song Title in bold font-heading */}
          <h2 className="font-heading font-extrabold text-base sm:text-lg text-white leading-tight truncate">
            {currentTrack.title}
          </h2>

          {/* Band / Artist Name with Click to Profile */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSelectArtist(currentTrack.artistId)}
              className="text-xs sm:text-sm font-bold text-[#53E6D4] hover:text-white hover:underline transition-colors cursor-pointer flex items-center gap-1"
              title="Visit Band Profile"
            >
              <span>{currentTrack.artist}</span>
              {currentTrack.verified && (
                <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4]" />
              )}
            </button>

            {currentTrack.district && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5 font-mono">
                <MapPin className="w-2.5 h-2.5 text-[#6045F4]" />
                {currentTrack.district.split(',')[0]}
              </span>
            )}
          </div>

          {/* Dynamic Audio Visualizer Bars */}
          <div className="pt-1 flex items-center justify-center sm:justify-start gap-1 h-5">
            {visualizerHeights.map((h, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isPlaying 
                    ? 'bg-gradient-to-t from-[#6045F4] to-[#53E6D4]' 
                    : 'bg-white/10'
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

        </div>

      </div>

      {/* ===================================================================== */}
      {/* 3. PROGRESS BAR & TIMESTAMPS                                          */}
      {/* ===================================================================== */}
      <div className="relative z-10 space-y-1">
        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden relative">
          <div 
            className="h-full bg-gradient-to-r from-[#6045F4] via-[#7F67FF] to-[#53E6D4] rounded-full transition-all duration-300 relative"
            style={{ width: `${progressPercent}%` }}
          >
            {isPlaying && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_#53E6D4]" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>{formatTime(progressSec)}</span>
          <span className="text-[9px] text-[#A78BFA] flex items-center gap-1 font-sans">
            <Shuffle className="w-2.5 h-2.5 text-[#53E6D4]" />
            Auto-shuffles random band song next
          </span>
          <span>{currentTrack.duration}</span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. CONTROLS: Shuffle Next, Play/Pause, Volume, Band Shortcut          */}
      {/* ===================================================================== */}
      <div className="relative z-10 flex items-center justify-between gap-1 sm:gap-2 pt-1 flex-nowrap">
        
        {/* Left: Previous & Mute */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handlePrevSong}
            id="radio-prev-btn"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95 border border-white/5"
            title="Previous track"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* Volume Mute */}
          <button
            type="button"
            onClick={handleToggleMute}
            id="radio-mute-btn"
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors cursor-pointer active:scale-95 border border-white/5 ${
              isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/5 hover:bg-white/15 text-slate-300'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Center: Primary Play / Pause Button (Smaller, compact, in one lane) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            id="radio-play-pause-btn"
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl font-heading font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md whitespace-nowrap ${
              isPlaying
                ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_15px_rgba(83,230,212,0.4)] hover:bg-[#6efae9]'
                : 'bg-[#6045F4] text-white shadow-[0_0_15px_rgba(96,69,244,0.4)] hover:bg-[#7257FF]'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current flex-shrink-0" />
                <span className="whitespace-nowrap">Pause Radio</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current translate-x-0.5 flex-shrink-0" />
                <span className="whitespace-nowrap">Play Davao Radio</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Next Random Song & Band Page Button (Both smaller, in one lane) */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => handleNextRandomSong()}
            id="radio-next-shuffle-btn"
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/5 hover:bg-[#6045F4] text-slate-300 hover:text-white flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer active:scale-95 border border-white/10 text-[10px] sm:text-xs font-semibold whitespace-nowrap"
            title="Play next random band song"
          >
            <Shuffle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#53E6D4] flex-shrink-0" />
            <span className="whitespace-nowrap">Next Random</span>
            <SkipForward className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden xs:inline" />
          </button>

          <button
            type="button"
            onClick={() => onSelectArtist(currentTrack.artistId)}
            id="radio-view-band-btn"
            className="px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#6045F4]/20 hover:bg-[#6045F4] text-[#53E6D4] hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[10px] sm:text-xs font-bold border border-[#6045F4]/30 whitespace-nowrap"
            title="Visit Band Profile"
          >
            <span className="whitespace-nowrap">Band Page</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
          </button>
        </div>

      </div>

    </div>
  );
};
