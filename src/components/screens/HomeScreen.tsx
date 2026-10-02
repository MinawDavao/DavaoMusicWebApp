import React, { useState, useEffect } from 'react';
import { Track, Gig, FeaturedBand, TopArtistItem, AdvertisementItem } from '../../types';
import { 
  MOCK_FEATURED_BANDS, 
  MOCK_TOP_10_ARTISTS, 
  MOCK_ADVERTISEMENTS,
  MOCK_TRACKS
} from '../../data/mockData';
import { 
  Play, 
  Pause, 
  ChevronRight, 
  ChevronLeft, 
  MapPin, 
  Headphones, 
  Calendar, 
  ShieldCheck, 
  Sparkles, 
  Tag, 
  Clock, 
  ExternalLink,
  Flame,
  Volume2,
  VolumeX,
  Ticket,
  Check,
  Radio,
  Music
} from 'lucide-react';

interface HomeScreenProps {
  tracks: Track[];
  gigs: Gig[];
  onSelectArtist: (artistId: string) => void;
  onNavigateToScreen: (screen: 'home' | 'audio' | 'connect' | 'deals' | 'artist' | 'fan' | 'marketplace') => void;
  onRsvpGig?: (gigId: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  tracks,
  gigs,
  onSelectArtist,
  onNavigateToScreen,
  onRsvpGig,
}) => {
  // 1. Featured Band Carousel State
  const [bandIndex, setBandIndex] = useState(0);
  const [bandImageIndex, setBandImageIndex] = useState(0);
  const [isCarouselAutoPaused, setIsCarouselAutoPaused] = useState(false);
  const [playingBandId, setPlayingBandId] = useState<string | null>(null);

  // 2. Advertisement Lane Carousel State
  const [adIndex, setAdIndex] = useState(0);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const [activeAdModal, setActiveAdModal] = useState<AdvertisementItem | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // 3. Audio preview state (strictly inline, no popup player)
  const [activePlayingTrackId, setActivePlayingTrackId] = useState<string | null>(null);

  const featuredBands = MOCK_FEATURED_BANDS;
  const currentBand = featuredBands[bandIndex] || featuredBands[0];
  const topArtists = MOCK_TOP_10_ARTISTS;
  const advertisements = MOCK_ADVERTISEMENTS;
  const currentAd = advertisements[adIndex] || advertisements[0];

  // Auto-advance Featured Bands carousel every 5.5 seconds (resets when user clicks next/prev)
  useEffect(() => {
    if (isCarouselAutoPaused) return;

    const timer = setInterval(() => {
      setBandIndex((prev) => (prev + 1) % featuredBands.length);
      setBandImageIndex(0);
    }, 5500);

    return () => clearInterval(timer);
  }, [isCarouselAutoPaused, featuredBands.length]);

  // Auto-advance Advertisement Lane every 5.0 seconds (pauses on hover)
  useEffect(() => {
    if (isAdPaused) return;

    const adTimer = setInterval(() => {
      setAdIndex((prev) => (prev + 1) % advertisements.length);
    }, 5000);

    return () => clearInterval(adTimer);
  }, [isAdPaused, advertisements.length]);

  const handleNextBand = () => {
    setBandIndex((prev) => (prev + 1) % featuredBands.length);
    setBandImageIndex(0);
  };

  const handlePrevBand = () => {
    setBandIndex((prev) => (prev - 1 + featuredBands.length) % featuredBands.length);
    setBandImageIndex(0);
  };

  const handleNextAd = () => {
    setAdIndex((prev) => (prev + 1) % advertisements.length);
  };

  const handlePrevAd = () => {
    setAdIndex((prev) => (prev - 1 + advertisements.length) % advertisements.length);
  };

  // Inline audio preview handler
  const handleToggleInlinePlay = (bandId: string, trackTitle: string) => {
    if (playingBandId === bandId) {
      setPlayingBandId(null);
    } else {
      setPlayingBandId(bandId);
    }
  };

  const handleCopyPromo = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen pb-24 pt-1 px-3 sm:px-4 max-w-2xl mx-auto space-y-6 text-[#EBEBED]">
      
      {/* ========================================================================= */}
      {/* 1. FEATURED BANDS CAROUSEL CARD */}
      {/* ========================================================================= */}
      <section 
        className="space-y-2.5"
        onMouseEnter={() => setIsCarouselAutoPaused(true)}
        onMouseLeave={() => setIsCarouselAutoPaused(false)}
        onTouchStart={() => setIsCarouselAutoPaused(true)}
        onTouchEnd={() => setTimeout(() => setIsCarouselAutoPaused(false), 4000)}
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-ping" />
            <h2 className="text-xs font-heading font-extrabold uppercase tracking-wider text-[#53E6D4]">
              Featured Bands
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">• Southern Mindanao</span>
          </div>

          {/* Carousel Next / Prev Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevBand}
              aria-label="Previous Featured Band"
              className="w-7 h-7 rounded-lg bg-[#161B20] hover:bg-[#6045F4] border border-white/10 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1">
              {bandIndex + 1}/{featuredBands.length}
            </span>
            <button
              onClick={handleNextBand}
              aria-label="Next Featured Band"
              className="w-7 h-7 rounded-lg bg-[#6045F4] hover:bg-[#7A62FF] text-white flex items-center justify-center shadow-[0_0_10px_rgba(96,69,244,0.5)] transition-all cursor-pointer active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Featured Band Card */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/15 overflow-hidden shadow-2xl relative transition-all duration-300">
          
          {/* Band Images Carousel Visual */}
          <div className="relative h-56 sm:h-64 w-full bg-[#0F1417] overflow-hidden group">
            <img
              src={currentBand.images[bandImageIndex] || currentBand.images[0]}
              alt={currentBand.name}
              className="w-full h-full object-cover object-center filter brightness-90 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-[#161B20]/40 to-transparent" />

            {/* Origin Badge on Image Top-Left */}
            <div className="absolute top-3 left-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-[#53E6D4]/50 shadow-md">
                <MapPin className="w-3 h-3 text-[#53E6D4]" />
                <span className="text-[10px] font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-none">
                  {currentBand.origin}
                </span>
              </div>
            </div>

            {/* Inner image thumbnail dots (if band has multiple gallery images) */}
            {currentBand.images.length > 1 && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 z-10">
                {currentBand.images.map((_, imgIdx) => (
                  <button
                    key={imgIdx}
                    onClick={() => setBandImageIndex(imgIdx)}
                    className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                      bandImageIndex === imgIdx ? 'bg-[#53E6D4] w-4' : 'bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Band Name & Genre Card (Positioned directly below Band Name in smaller font) */}
            <div className="absolute bottom-3 left-3.5 right-16 space-y-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xl sm:text-2xl font-heading font-extrabold text-white tracking-tight drop-shadow-md">
                  {currentBand.name}
                </h3>
                {currentBand.verified && (
                  <ShieldCheck className="w-4 h-4 text-[#53E6D4]" />
                )}
              </div>

              {/* Genre card below band name in a smaller font */}
              <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#6045F4]/85 backdrop-blur-md border border-[#6045F4]/60 shadow-sm">
                <span className="text-[9px] font-semibold text-white/95 tracking-wide">
                  {currentBand.genre}
                </span>
              </div>
            </div>
          </div>

          {/* Description & Action Buttons Below Image */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <p className="text-xs sm:text-sm text-[#8E9AA7] leading-relaxed">
              {currentBand.description}
            </p>

            {/* Track Info Preview Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1417] border border-white/5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  playingBandId === currentBand.id ? 'bg-[#53E6D4] text-[#0F1417] animate-pulse' : 'bg-[#6045F4]/30 text-[#53E6D4]'
                }`}>
                  <Music className="w-3.5 h-3.5" />
                </div>
                <div className="truncate">
                  <span className="text-[10px] text-slate-400 block font-mono">Featured Anthem</span>
                  <span className="text-white font-bold text-xs truncate block">{currentBand.trackTitle}</span>
                </div>
              </div>

              {playingBandId === currentBand.id && (
                <div className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-[#53E6D4]/10 text-[#53E6D4] text-[10px] font-mono">
                  <span className="w-1 h-3 bg-[#53E6D4] animate-pulse" />
                  <span className="w-1 h-2 bg-[#53E6D4] animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-1 h-4 bg-[#53E6D4] animate-pulse" style={{ animationDelay: '0.4s' }} />
                  <span className="ml-1">Playing</span>
                </div>
              )}
            </div>

            {/* Action Buttons: Listen & Visit Band Page */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Button to Listen */}
              <button
                onClick={() => handleToggleInlinePlay(currentBand.id, currentBand.trackTitle)}
                id="featured-band-listen-btn"
                className={`w-full py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-md ${
                  playingBandId === currentBand.id
                    ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_15px_rgba(83,230,212,0.4)]'
                    : 'bg-[#6045F4] hover:bg-[#7A62FF] text-white shadow-[0_0_15px_rgba(96,69,244,0.4)]'
                }`}
              >
                {playingBandId === currentBand.id ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause Track</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Listen Now</span>
                  </>
                )}
              </button>

              {/* Button to Visit Band Page */}
              <button
                onClick={() => onSelectArtist(currentBand.id)}
                id="featured-band-visit-page-btn"
                className="w-full py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/15 text-white border border-white/15 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
              >
                <span>Visit Band Page</span>
                <ChevronRight className="w-4 h-4 text-[#53E6D4]" />
              </button>
            </div>

            {/* Carousel Dot Indicators & Next Button */}
            <div className="pt-2 flex items-center justify-between border-t border-white/5">
              <div className="flex items-center gap-1.5">
                {featuredBands.map((b, idx) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBandIndex(idx);
                      setBandImageIndex(0);
                    }}
                    aria-label={`Jump to ${b.name}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      bandIndex === idx ? 'w-6 bg-[#6045F4]' : 'w-2 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNextBand}
                className="text-[11px] font-semibold text-[#53E6D4] hover:text-white flex items-center gap-0.5 cursor-pointer"
              >
                <span>Next Featured Band</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. TOP 10 ARTISTS (BASED ON USER LISTENS) */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-heading font-extrabold uppercase tracking-wider text-[#53E6D4]">
              <Headphones className="w-3.5 h-3.5" /> Top 10 Davao Artists
            </div>
            <p className="text-[11px] text-[#8E9AA7]">
              Ranked by verified user listens & streams across Davao
            </p>
          </div>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
            Live Leaderboard
          </span>
        </div>

        {/* Top 10 List Card */}
        <div className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-2 sm:p-3 divide-y divide-white/5 shadow-xl">
          {topArtists.map((artist) => {
            const isTop3 = artist.rank <= 3;
            const rankBadgeClass = 
              artist.rank === 1
                ? 'bg-gradient-to-br from-[#FFB800] to-[#E59400] text-black font-extrabold shadow-[0_0_12px_rgba(255,184,0,0.6)]'
                : artist.rank === 2
                ? 'bg-slate-300 text-slate-900 font-extrabold shadow-[0_0_10px_rgba(255,255,255,0.4)]'
                : artist.rank === 3
                ? 'bg-[#CD7F32] text-white font-extrabold shadow-[0_0_10px_rgba(205,127,50,0.4)]'
                : 'bg-white/10 text-slate-400 font-bold';

            return (
              <div
                key={artist.id}
                className="py-2.5 px-2 sm:px-3 flex items-center justify-between gap-3 hover:bg-white/5 rounded-xl transition-all group"
              >
                {/* Left: Rank & Avatar & Info */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  {/* Rank Badge */}
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${rankBadgeClass}`}>
                    #{artist.rank}
                  </div>

                  {/* Avatar */}
                  <div className="relative flex-shrink-0 cursor-pointer" onClick={() => onSelectArtist(artist.id)}>
                    <img
                      src={artist.avatar}
                      alt={artist.name}
                      className="w-10 h-10 rounded-xl object-cover border border-white/15 group-hover:border-[#53E6D4] transition-all"
                    />
                    {isTop3 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#53E6D4] ring-1 ring-[#0F1417]" />
                    )}
                  </div>

                  {/* Text Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h4 
                        onClick={() => onSelectArtist(artist.id)}
                        className="font-heading font-bold text-white text-xs sm:text-sm truncate group-hover:text-[#53E6D4] transition-colors cursor-pointer"
                      >
                        {artist.name}
                      </h4>
                      {artist.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="text-[#53E6D4] font-medium truncate max-w-[100px] sm:max-w-none">{artist.genre}</span>
                      <span>•</span>
                      <span className="text-slate-400 truncate max-w-[90px] sm:max-w-none">{artist.origin}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Listens Count & Visit Button */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-xs font-mono font-bold text-white">
                      <Headphones className="w-3 h-3 text-[#53E6D4]" />
                      <span>{artist.totalListens.toLocaleString()}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 block font-mono">listens</span>
                  </div>

                  <button
                    onClick={() => onSelectArtist(artist.id)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-[#6045F4] text-slate-300 hover:text-white transition-all cursor-pointer"
                    title={`View ${artist.name} profile`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. ADVERTISEMENT LANE (AUTO CHANGES WITH LEARN MORE BUTTON) */}
      {/* ========================================================================= */}
      <section 
        className="space-y-2.5"
        onMouseEnter={() => setIsAdPaused(true)}
        onMouseLeave={() => setIsAdPaused(false)}
        onTouchStart={() => setIsAdPaused(true)}
        onTouchEnd={() => setIsAdPaused(false)}
      >
        <div className="flex items-center justify-between px-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Tag className="w-3.5 h-3.5 text-[#6045F4]" />
            <span>Sponsored Spotlight</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-[#53E6D4] animate-pulse" />
            <span className="font-mono">Scene Deals & Partners</span>
          </div>
        </div>

        {/* Advertisement Card Banner (Bigger Vertical Layout: Image Top, Infos Below) */}
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#181D24] to-[#12161A] border border-[#6045F4]/30 hover:border-[#6045F4]/60 overflow-hidden relative shadow-xl transition-all duration-300 group">
          
          {/* Ad Banner Image (Separate Line on Top) */}
          <div 
            className="relative w-full h-48 sm:h-56 md:h-64 overflow-hidden bg-black cursor-pointer"
            onClick={() => setActiveAdModal(currentAd)}
          >
            <img
              src={currentAd.imageUrl}
              alt={currentAd.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            {/* Ambient Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#181D24] via-black/25 to-black/60 pointer-events-none" />

            {/* Top Left: Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-[#53E6D4]/40 text-[#53E6D4] text-[10px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-lg">
                <Sparkles className="w-3 h-3 text-[#53E6D4]" />
                {currentAd.badge}
              </span>
            </div>

            {/* Top Right: Prev / Next Navigation Controls */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2 py-1 rounded-full border border-white/15 shadow-lg">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevAd();
                }}
                className="w-6 h-6 rounded-full hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Previous spotlight"
                aria-label="Previous spotlight"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-slate-300 font-mono px-1">
                {adIndex + 1} / {advertisements.length}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextAd();
                }}
                className="w-6 h-6 rounded-full hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Next spotlight"
                aria-label="Next spotlight"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bottom Overlay: Slide Dots */}
            <div className="absolute bottom-3 left-3 sm:left-4 flex items-center gap-1.5 z-10">
              {advertisements.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdIndex(idx);
                  }}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    adIndex === idx ? 'bg-[#53E6D4] w-6 shadow-[0_0_8px_rgba(83,230,212,0.8)]' : 'bg-white/40 hover:bg-white/80 w-2'
                  }`}
                  title={`Go to slide ${idx + 1}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Ad Infos & Actions (Separate Line Below) */}
          <div className="p-4 sm:p-5 space-y-3">
            {/* Sponsor and Status Tag */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#A78BFA] uppercase tracking-wider">
                  Featured Sponsor
                </span>
                <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">
                  {currentAd.sponsorName}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 hidden sm:inline">
                Auto-advancing
              </span>
            </div>

            {/* Ad Headline / Title */}
            <h3 
              onClick={() => setActiveAdModal(currentAd)}
              className="font-heading font-extrabold text-white text-base sm:text-lg leading-snug group-hover:text-[#53E6D4] transition-colors cursor-pointer"
            >
              {currentAd.title}
            </h3>

            {/* Ad Tagline / Description */}
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed line-clamp-2">
              {currentAd.tagline}
            </p>

            {/* Actions & Promo Code Row */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveAdModal(currentAd)}
                  id="ad-lane-learn-more-btn"
                  className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[#6045F4] hover:bg-[#7257FF] text-white font-heading font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-[0_0_15px_rgba(96,69,244,0.4)] transition-all cursor-pointer active:scale-95"
                >
                  <span>Learn More</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onNavigateToScreen('deals')}
                  className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>Deals Hub</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#53E6D4]" />
                </button>
              </div>

              {currentAd.promoCode && (
                <div className="flex items-center gap-2 bg-[#0C1014] px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 font-mono">Code:</span>
                  <button
                    onClick={() => handleCopyPromo(currentAd.promoCode!)}
                    className="text-xs font-mono font-bold text-[#53E6D4] hover:underline cursor-pointer flex items-center gap-1"
                    title="Click to copy promo code"
                  >
                    <span>{currentAd.promoCode}</span>
                    <span className="text-[10px] text-slate-400 font-sans ml-1">
                      {copiedCode ? '✓ Copied' : '(copy)'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. UPCOMING GIGS */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-heading font-extrabold uppercase tracking-wider text-[#53E6D4]">
              <Calendar className="w-3.5 h-3.5" /> Upcoming Gigs
            </div>
            <p className="text-[11px] text-[#8E9AA7]">
              Live soundstages and shows across Davao City
            </p>
          </div>

          <button
            onClick={() => onNavigateToScreen('connect')}
            className="text-xs font-semibold text-[#53E6D4] hover:text-white flex items-center gap-0.5 cursor-pointer"
          >
            <span>All Gigs</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Gigs List */}
        <div className="space-y-3">
          {gigs.map((gig) => {
            return (
              <div
                key={gig.id}
                className="rounded-2xl bg-[#161B20] border border-white/10 p-3.5 sm:p-4 hover:border-[#6045F4]/50 transition-all shadow-lg flex flex-col justify-between space-y-3 group"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#6045F4]/20 border border-[#6045F4]/30 text-[#53E6D4] text-[10px] font-bold font-mono">
                        {gig.date} • {gig.time}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300 text-[10px] font-mono">
                        {gig.district}
                      </span>
                    </div>

                    <h4 className="font-heading font-bold text-white text-sm sm:text-base group-hover:text-[#53E6D4] transition-colors leading-snug">
                      {gig.title}
                    </h4>

                    <p className="text-xs text-white/90 font-medium">
                      Headliner: <strong className="text-white">{gig.bandName}</strong>
                    </p>

                    {gig.supportingActs && gig.supportingActs.length > 0 && (
                      <p className="text-[11px] text-[#8E9AA7] truncate">
                        With: {gig.supportingActs.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Gig Cover Thumbnail */}
                  <img
                    src={gig.coverImage}
                    alt={gig.title}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-white/10 flex-shrink-0"
                  />
                </div>

                {/* Gig Footer / RSVP and Venue */}
                <div className="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex items-center gap-1 text-[11px] text-[#FFB800] truncate">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{gig.venue}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                      {gig.doorCharge}
                    </span>

                    <button
                      onClick={() => onRsvpGig && onRsvpGig(gig.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                        gig.isUserRsvpd
                          ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_10px_rgba(83,230,212,0.4)]'
                          : 'bg-[#6045F4] hover:bg-[#7A62FF] text-white shadow-[0_0_10px_rgba(96,69,244,0.4)]'
                      }`}
                    >
                      {gig.isUserRsvpd ? (
                        <>
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Going! ({gig.rsvpCount})</span>
                        </>
                      ) : (
                        <>
                          <Ticket className="w-3 h-3" />
                          <span>RSVP ({gig.rsvpCount})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. ADVERTISEMENT DETAIL MODAL */}
      {/* ========================================================================= */}
      {activeAdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl p-5 bg-[#161B20] border border-[#6045F4]/40 shadow-2xl relative space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveAdModal(null)}
              className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs cursor-pointer transition-colors"
            >
              ✕
            </button>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#53E6D4]/20 text-[#53E6D4] border border-[#53E6D4]/30">
                {activeAdModal.badge}
              </span>
              <span className="text-xs text-slate-400 font-mono truncate">
                {activeAdModal.sponsorName}
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-heading font-extrabold text-white leading-snug pr-7">
              {activeAdModal.title}
            </h3>

            <div className="h-40 sm:h-48 rounded-xl overflow-hidden bg-black relative">
              <img
                src={activeAdModal.imageUrl}
                alt={activeAdModal.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            </div>

            <p className="text-xs sm:text-sm text-[#CBD5E1] leading-relaxed">
              {activeAdModal.details}
            </p>

            {activeAdModal.promoCode && (
              <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">Promo Code</span>
                  <span className="text-sm font-mono font-bold text-[#53E6D4]">{activeAdModal.promoCode}</span>
                </div>
                <button
                  onClick={() => handleCopyPromo(activeAdModal.promoCode!)}
                  className="px-3 py-1.5 rounded-lg bg-[#6045F4] hover:bg-[#7A62FF] text-white text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-[0_0_10px_rgba(96,69,244,0.3)]"
                >
                  {copiedCode ? 'Copied! ✓' : 'Copy Code'}
                </button>
              </div>
            )}

            <div className="pt-1 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => {
                  setActiveAdModal(null);
                  onNavigateToScreen('deals');
                }}
                className="px-4 py-2 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white text-xs font-bold font-heading cursor-pointer active:scale-95 transition-all shadow-[0_0_12px_rgba(96,69,244,0.4)]"
              >
                Go to Deals Tab →
              </button>
              <button
                onClick={() => setActiveAdModal(null)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
