import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

/**
 * Tap-to-play YouTube video: only the thumbnail loads at first (fast on mobile data, nothing loaded from YouTube's player
 * until the visitor taps). Tapping pauses the MINAW music player and plays the video with sound.
 * Uses YouTube's privacy-enhanced player (youtube-nocookie.com).
 */
export const YouTubeCard: React.FC<{ id: string; start?: number | null; title?: string }> = ({ id, start, title = 'Video' }) => {
  const [on, setOn] = useState(false);
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  const player = usePlayer();

  const play = () => {
    if (player.playing) player.toggle();   // don't play over a song
    setOn(true);
  };

  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' });
  if (start) params.set('start', String(start));

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/[0.08]">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
          title={title}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button onClick={play} className="absolute inset-0 w-full h-full cursor-pointer group" aria-label={`Play ${title}`}>
          <img src={thumb} alt="" loading="lazy" onError={() => setThumb(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`)} className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[#FF0033] shadow-[0_6px_24px_rgba(0,0,0,0.5)] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </span>
          <span className="absolute left-3 bottom-2.5 text-[11px] font-bold text-white/90">Tap to play · YouTube</span>
        </button>
      )}
    </div>
  );
};
