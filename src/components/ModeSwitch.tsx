import React from 'react';
import { Music } from 'lucide-react';
import { useNav } from '../nav';

/**
 * The big MUSIC | HOOP METHOD switch at the top of both apps, so everyone can see there are two sides
 * to MINAW DAVAO and jump between them with one tap.
 */
export const ModeSwitch: React.FC<{ active: 'music' | 'hoop' }> = ({ active }) => {
  const go = useNav();
  const seg = 'relative flex-1 min-w-0 h-10 rounded-[10px] flex items-center justify-center gap-2 px-2 cursor-pointer transition-colors';
  return (
    <div role="tablist" aria-label="Switch between MINAW music and Hoop Method basketball"
      className="flex gap-1 p-1 rounded-[14px] bg-black/40 border border-white/10">
      <button role="tab" aria-selected={active === 'music'} onClick={() => active !== 'music' && go({ name: 'home' })}
        className={`${seg} ${active === 'music' ? 'text-white shadow-[0_0_14px_rgba(83,230,212,0.25)]' : 'text-[#A8B3BD] hover:text-white hover:bg-white/[0.05]'}`}
        style={active === 'music' ? { background: 'linear-gradient(110deg,#1E7F78,#4B3FC4)' } : undefined}>
        <Music className={`w-4 h-4 flex-shrink-0 ${active === 'music' ? 'text-[#53E6D4]' : ''}`} />
        <span className="leading-none text-left min-w-0">
          <span className="block text-[13px] font-extrabold tracking-wide truncate">MINAW MUSIC</span>
          <span className={`block text-[9px] font-semibold truncate ${active === 'music' ? 'text-white/75' : 'text-[#7D8893]'}`}>Bands · songs · gigs</span>
        </span>
      </button>
      <button role="tab" aria-selected={active === 'hoop'} onClick={() => active !== 'hoop' && go({ name: 'hoop' })}
        className={`${seg} ${active === 'hoop' ? 'text-[#111] shadow-[0_0_14px_rgba(242,140,20,0.35)]' : 'text-[#E7C9A5] hover:text-white hover:bg-[#F28C14]/10'}`}
        style={active === 'hoop' ? { background: 'linear-gradient(110deg,#F7A51C,#E8771A)' } : { boxShadow: 'inset 0 0 0 1px rgba(242,140,20,0.35)' }}>
        <img src="/hoop-ball.png" alt="" className="w-6 h-6 flex-shrink-0" />
        <span className="leading-none text-left min-w-0">
          <span className="block text-[13px] font-extrabold tracking-wide truncate">HOOP METHOD</span>
          <span className={`block text-[9px] font-semibold truncate ${active === 'hoop' ? 'text-black/65' : 'text-[#B08A62]'}`}>Basketball clubs</span>
        </span>
        {active !== 'hoop' && <span className="absolute -top-1.5 -right-1 px-1.5 py-[1px] rounded-full bg-[#FF4D5E] text-white text-[8px] font-black tracking-wider">NEW</span>}
      </button>
    </div>
  );
};
