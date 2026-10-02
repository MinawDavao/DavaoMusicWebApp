import React, { useState, useMemo } from 'react';
import { Track, FeaturedBand, TopArtistItem, DavaoArtist } from '../../types';
import { 
  MOCK_FEATURED_BANDS, 
  MOCK_TOP_10_ARTISTS, 
  DAVAO_ARTISTS_LIST 
} from '../../data/mockData';
import { audioEngine } from '../../utils/audioSynth';
import { DavaoRadioCard } from '../audio/DavaoRadioCard';
import { 
  Search, 
  X, 
  Play, 
  Pause, 
  ShieldCheck, 
  MapPin, 
  Headphones, 
  Sparkles, 
  ChevronRight, 
  Trophy, 
  Music, 
  Flame,
  ArrowRight,
  Filter
} from 'lucide-react';

interface AudioScreenProps {
  tracks: Track[];
  onSelectArtist: (artistId: string) => void;
}

const AVAILABLE_GENRES = [
  'All Genres',
  'BisRock',
  'Mindanao Indie',
  'Island Reggae',
  'Funk Rock',
  'Classic Davao Hard Rock',
  'Neo-Soul',
  'Afro-Brass',
  'Garage Rock',
  'Lo-Fi Beats',
  'Post-Hardcore',
  'World Fusion',
];

export const AudioScreen: React.FC<AudioScreenProps> = ({
  tracks,
  onSelectArtist,
}) => {
  // Search query & selected genre filter states
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All Genres');

  // Inline audio preview state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  // Featured band carousel index
  const [featuredBandIdx, setFeaturedBandIdx] = useState(0);

  // Combine artists list with top 10 & featured bands for complete dataset
  const allBands: DavaoArtist[] = useMemo(() => {
    return DAVAO_ARTISTS_LIST;
  }, []);

  // Handle explicit search button execution
  const handleExecuteSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveQuery(searchInput.trim());
  };

  // Handle clearing the search
  const handleClearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
    setSelectedGenre('All Genres');
  };

  // Genre selection handler
  const handleSelectGenre = (genre: string) => {
    setSelectedGenre(genre);
    // If a user clicks a genre pill, also execute filter immediately
  };

  // Inline audio synthesizer playback toggle
  const handleToggleAudio = (trackId: string, genreOrPreset?: string) => {
    if (playingTrackId === trackId) {
      audioEngine.pause();
      setPlayingTrackId(null);
    } else {
      let preset: 'rock' | 'indie' | 'reggae' | 'synthwave' = 'indie';
      const g = (genreOrPreset || '').toLowerCase();
      if (g.includes('rock') || g.includes('hard') || g.includes('bisrock')) {
        preset = 'rock';
      } else if (g.includes('reggae') || g.includes('roots')) {
        preset = 'reggae';
      } else if (g.includes('synth') || g.includes('soul') || g.includes('lo-fi')) {
        preset = 'synthwave';
      }
      audioEngine.playTrack(preset);
      setPlayingTrackId(trackId);
    }
  };

  // Filter bands based on search input / active query and selected genre
  const filteredBands = useMemo(() => {
    const rawQuery = (activeQuery || searchInput).trim().toLowerCase();
    // Normalize query: remove filler words like "band", "the"
    const cleanQuery = rawQuery.replace(/\bband\b/g, '').trim();

    return allBands.filter((band) => {
      // 1. Genre filter check
      const matchesGenre = 
        selectedGenre === 'All Genres' ||
        band.genre.toLowerCase().includes(selectedGenre.toLowerCase()) ||
        (selectedGenre === 'BisRock' && (band.genre.toLowerCase().includes('bisrock') || band.genre.toLowerCase().includes('hard rock'))) ||
        (selectedGenre === 'Classic Davao Hard Rock' && (band.genre.toLowerCase().includes('hard rock') || band.genre.toLowerCase().includes('bisrock'))) ||
        (selectedGenre === 'Mindanao Indie' && band.genre.toLowerCase().includes('indie')) ||
        (selectedGenre === 'Lo-Fi Beats' && (band.genre.toLowerCase().includes('lo-fi') || band.genre.toLowerCase().includes('beat')));

      // 2. Query filter check
      if (!cleanQuery) {
        return matchesGenre;
      }

      const nameMatch = band.name.toLowerCase().includes(cleanQuery);
      const genreMatch = band.genre.toLowerCase().includes(cleanQuery);
      const districtMatch = band.district.toLowerCase().includes(cleanQuery);
      const bioMatch = band.bio.toLowerCase().includes(cleanQuery);
      const trackMatch = band.featuredTrackTitle.toLowerCase().includes(cleanQuery);

      return (nameMatch || genreMatch || districtMatch || bioMatch || trackMatch) && matchesGenre;
    });
  }, [allBands, activeQuery, searchInput, selectedGenre]);

  const isFilteringActive = activeQuery.trim().length > 0 || searchInput.trim().length > 0 || selectedGenre !== 'All Genres';

  // Current featured band item
  const currentFeatured = MOCK_FEATURED_BANDS[featuredBandIdx] || MOCK_FEATURED_BANDS[0];

  return (
    <div className="min-h-screen pb-28 pt-2 px-3 sm:px-4 max-w-2xl mx-auto space-y-6 text-[#EBEBED]">
      
      {/* 1. Header: Search Band by Genre */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#6045F4] flex items-center justify-center text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]">
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-white tracking-tight">
              Audio & Bands
            </h1>
            <p className="text-[9.5px] sm:text-[11px] text-[#8E9AA7] whitespace-nowrap truncate tracking-tight">
              Search local bands by genre or explore the Davao City music scene
            </p>
          </div>
        </div>

        {/* Search Bar with Search Button Option */}
        <form onSubmit={handleExecuteSearch} className="space-y-2.5">
          <div className="flex items-center gap-2 bg-[#161B20] p-1.5 rounded-2xl border border-white/10 shadow-lg focus-within:border-[#6045F4] transition-all">
            <div className="pl-2.5 text-[#8E9AA7]">
              <Search className="w-4 h-4" />
            </div>

            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Search band or genre (e.g. "Caliber 45", "BisRock")...'
              className="flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-[#8E9AA7] focus:outline-none px-1"
            />

            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="p-1 rounded-lg text-[#8E9AA7] hover:text-white cursor-pointer"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Explicit Search Button Option requested by user */}
            <button
              type="submit"
              id="audio-search-btn"
              className="px-3.5 py-2 rounded-xl bg-[#6045F4] hover:bg-[#7052FF] text-white font-heading font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-[0_0_15px_rgba(96,69,244,0.4)] active:scale-95 transition-all cursor-pointer flex-shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>

          {/* Genre Filter Pills */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#8E9AA7] px-1 font-medium">
              <span className="flex items-center gap-1">
                <Filter className="w-3 h-3 text-[#53E6D4]" />
                Filter by Genre:
              </span>
              {isFilteringActive && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="text-[#53E6D4] hover:underline cursor-pointer text-[10px]"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
              {AVAILABLE_GENRES.map((genre) => {
                const isActive = selectedGenre === genre;
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => handleSelectGenre(genre)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#6045F4] text-white shadow-[0_0_10px_rgba(96,69,244,0.5)] border border-[#6045F4]'
                        : 'bg-[#161B20] text-[#8E9AA7] hover:text-white hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </section>

      {/* ========================================================================= */}
      {/* 2. DAVAO BAND COMMUNITY RADIO CARD (Continuous Random Band Shuffle)       */}
      {/* No autoplay; user chooses to play; displays Now Playing info, genre, etc. */}
      {/* ========================================================================= */}
      <section className="pt-0.5">
        <DavaoRadioCard
          tracks={tracks}
          onSelectArtist={onSelectArtist}
          externalPlayingId={playingTrackId}
          onRadioPlayStateChange={(isRadioActive) => {
            if (isRadioActive) {
              setPlayingTrackId(null);
            }
          }}
        />
      </section>

      {/* ========================================================================= */}
      {/* 3. SEARCH RESULTS WITH BAND INFOS (When user searches or filters)         */}
      {/* ========================================================================= */}
      {isFilteringActive && (
        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-heading font-extrabold uppercase tracking-wider text-[#53E6D4] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#53E6D4]" />
              <span>
                Search Results ({filteredBands.length})
                {activeQuery || searchInput ? ` for "${activeQuery || searchInput}"` : ''}
              </span>
            </h2>
            <button
              onClick={handleClearSearch}
              className="text-[10px] text-[#8E9AA7] hover:text-white cursor-pointer"
            >
              Clear Search
            </button>
          </div>

          {filteredBands.length === 0 ? (
            <div className="bg-[#161B20] rounded-2xl p-6 text-center border border-white/10 space-y-2">
              <Music className="w-8 h-8 text-[#8E9AA7] mx-auto opacity-50" />
              <p className="text-sm font-semibold text-white">No bands matched your search</p>
              <p className="text-xs text-[#8E9AA7] max-w-xs mx-auto">
                Try searching for "Caliber 45", "BisRock", "Indie", or reset your genre filter.
              </p>
              <button
                onClick={handleClearSearch}
                className="mt-2 px-3 py-1.5 rounded-xl bg-[#6045F4] text-white text-xs font-semibold cursor-pointer"
              >
                Show All Bands
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBands.map((band) => {
                const isPlaying = playingTrackId === band.id;
                return (
                  <div
                    key={band.id}
                    onClick={() => onSelectArtist(band.id)}
                    className="group bg-[#161B20] hover:bg-[#1C2228] rounded-2xl border border-white/10 hover:border-[#6045F4]/60 p-4 transition-all duration-200 shadow-lg cursor-pointer space-y-3"
                  >
                    {/* Top Row: Avatar, Name, Genre Card & District */}
                    <div className="flex items-start gap-3">
                      <div className="relative flex-shrink-0">
                        <img
                          src={band.avatar}
                          alt={band.name}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-white/10 group-hover:scale-102 transition-transform shadow-md"
                        />
                        {band.verified && (
                          <span className="absolute -bottom-1 -right-1 p-0.5 bg-[#53E6D4] text-[#0F1417] rounded-full border border-[#0F1417]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-base sm:text-lg font-heading font-extrabold text-white group-hover:text-[#53E6D4] transition-colors truncate">
                            {band.name}
                          </h3>
                          <span className="text-[10px] text-[#53E6D4] font-mono flex-shrink-0">
                            {band.monthlyListeners.toLocaleString()} listeners
                          </span>
                        </div>

                        {/* Genre card below band name in smaller font */}
                        <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#6045F4]/80 border border-[#6045F4]/50 shadow-sm">
                          <span className="text-[9px] font-semibold text-white/95">
                            {band.genre}
                          </span>
                        </div>

                        {/* District / Origin */}
                        <p className="flex items-center gap-1 text-[11px] text-[#8E9AA7]">
                          <MapPin className="w-3 h-3 text-[#53E6D4] flex-shrink-0" />
                          <span className="truncate">{band.district}</span>
                        </p>
                      </div>
                    </div>

                    {/* Band Bio info */}
                    <p className="text-xs text-[#8E9AA7] line-clamp-2 leading-relaxed">
                      {band.bio}
                    </p>

                    {/* Featured Track Info Bar with Play/Pause */}
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="flex items-center justify-between p-2 rounded-xl bg-[#0F1417] border border-white/5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleAudio(band.id, band.genre)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                            isPlaying
                              ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_10px_rgba(83,230,212,0.5)]'
                              : 'bg-[#6045F4] text-white hover:bg-[#7052FF]'
                          }`}
                          title={isPlaying ? 'Pause' : 'Play Preview'}
                        >
                          {isPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                          )}
                        </button>
                        <div className="truncate">
                          <span className="text-[9px] text-[#8E9AA7] block font-mono">Featured Anthem</span>
                          <span className="text-white font-bold text-xs truncate block">{band.featuredTrackTitle}</span>
                        </div>
                      </div>

                      <span className="text-[10px] text-[#8E9AA7] font-mono flex-shrink-0">
                        {band.featuredTrackDuration}
                      </span>
                    </div>

                    {/* Click CTA to Main Band Profile Page */}
                    <div className="pt-1 flex items-center justify-between text-xs font-heading font-bold text-[#53E6D4] group-hover:text-white transition-colors">
                      <span className="text-[11px]">Click to view full band profile & gigs</span>
                      <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        <span>View Band Profile</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. FEATURED BAND SECTION (Below Search)                                   */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-ping" />
            <h2 className="text-xs font-heading font-extrabold uppercase tracking-wider text-[#53E6D4]">
              Featured Band
            </h2>
          </div>
          <span className="text-[10px] text-[#8E9AA7]">Davao Spotlight</span>
        </div>

        {/* Featured Band Card */}
        <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-[#161B20] border border-white/10 shadow-2xl transition-all">
          {/* Cover & Atmosphere */}
          <div className="relative h-48 sm:h-56 w-full overflow-hidden">
            <img
              src={currentFeatured.images[0]}
              alt={currentFeatured.name}
              className="w-full h-full object-cover object-center filter brightness-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-[#161B20]/40 to-transparent" />

            {/* Top pill badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-[#53E6D4]/50 text-[#53E6D4] text-[10px] font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#53E6D4]" />
                Featured Band
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-[10px]">
                {currentFeatured.origin}
              </span>
            </div>

            {/* Band Name & Genre Card (Positioned below band name in smaller font) */}
            <div className="absolute bottom-3 left-3.5 right-4 space-y-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xl sm:text-2xl font-heading font-extrabold text-white tracking-tight drop-shadow-md">
                  {currentFeatured.name}
                </h3>
                {currentFeatured.verified && (
                  <ShieldCheck className="w-4 h-4 text-[#53E6D4]" />
                )}
              </div>

              {/* Genre card below band name in a smaller font */}
              <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#6045F4]/85 backdrop-blur-md border border-[#6045F4]/60 shadow-sm">
                <span className="text-[9px] font-semibold text-white/95 tracking-wide">
                  {currentFeatured.genre}
                </span>
              </div>
            </div>
          </div>

          {/* Description & Action Buttons */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <p className="text-xs sm:text-sm text-[#8E9AA7] leading-relaxed">
              {currentFeatured.description}
            </p>

            {/* Featured Track Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1417] border border-white/5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  playingTrackId === currentFeatured.id ? 'bg-[#53E6D4] text-[#0F1417] animate-pulse' : 'bg-[#6045F4]/30 text-[#53E6D4]'
                }`}>
                  <Music className="w-3.5 h-3.5" />
                </div>
                <div className="truncate">
                  <span className="text-[10px] text-[#8E9AA7] block font-mono">Featured Anthem</span>
                  <span className="text-white font-bold text-xs truncate block">{currentFeatured.trackTitle}</span>
                </div>
              </div>

              <span className="text-[10px] text-[#8E9AA7] font-mono">
                {currentFeatured.trackDuration}
              </span>
            </div>

            {/* Action Buttons: Listen & Visit Band Profile */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleToggleAudio(currentFeatured.id, currentFeatured.genre)}
                className={`w-full py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md ${
                  playingTrackId === currentFeatured.id
                    ? 'bg-[#53E6D4] text-[#0F1417]'
                    : 'bg-[#6045F4] hover:bg-[#7A62FF] text-white'
                }`}
              >
                {playingTrackId === currentFeatured.id ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Listen</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectArtist(currentFeatured.id)}
                id="featured-band-profile-btn"
                className="w-full py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/15 text-white border border-white/15 flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <span>Visit Band Page</span>
                <ChevronRight className="w-4 h-4 text-[#53E6D4]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. TOP 10 BAND SECTION (Below Featured Band)                              */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#FFB800]" />
            <h2 className="text-xs font-heading font-extrabold uppercase tracking-wider text-white">
              Top 10 Bands
            </h2>
          </div>
          <span className="text-[10px] text-[#53E6D4] font-mono">Southern Mindanao</span>
        </div>

        {/* Top 10 Ranked List */}
        <div className="space-y-2">
          {MOCK_TOP_10_ARTISTS.slice(0, 10).map((artist) => {
            const isPlaying = playingTrackId === artist.id;
            return (
              <div
                key={artist.id}
                onClick={() => onSelectArtist(artist.id)}
                className="group flex items-center justify-between p-3 rounded-2xl bg-[#161B20] hover:bg-[#1C2228] border border-white/5 hover:border-[#6045F4]/50 transition-all cursor-pointer shadow-md"
              >
                {/* Left: Rank Badge + Avatar + Name + Genre Card */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Rank badge */}
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-heading font-extrabold flex-shrink-0 ${
                      artist.rank === 1
                        ? 'bg-[#FFB800] text-black shadow-[0_0_10px_rgba(255,184,0,0.5)]'
                        : artist.rank === 2
                        ? 'bg-[#53E6D4] text-black shadow-[0_0_10px_rgba(83,230,212,0.4)]'
                        : artist.rank === 3
                        ? 'bg-[#6045F4] text-white shadow-[0_0_10px_rgba(96,69,244,0.4)]'
                        : 'bg-white/5 text-[#8E9AA7]'
                    }`}
                  >
                    {artist.rank}
                  </span>

                  {/* Avatar */}
                  <img
                    src={artist.avatar}
                    alt={artist.name}
                    className="w-11 h-11 rounded-xl object-cover border border-white/10 flex-shrink-0 group-hover:scale-105 transition-transform"
                  />

                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs sm:text-sm font-heading font-bold text-white group-hover:text-[#53E6D4] transition-colors truncate">
                        {artist.name}
                      </p>
                      {artist.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />
                      )}
                    </div>

                    {/* Genre card below band name in smaller font */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-[#6045F4]/30 border border-[#6045F4]/40 text-[9px] font-semibold text-[#53E6D4] truncate">
                        {artist.genre}
                      </span>
                      <span className="text-[10px] text-[#8E9AA7] hidden sm:inline truncate">
                        • {artist.origin}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Plays & Visit link */}
                <div className="flex items-center gap-2.5 flex-shrink-0 pl-2">
                  <div className="text-right hidden xs:block">
                    <span className="text-[10px] font-mono text-slate-300 block">
                      {artist.totalListens.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-[#8E9AA7] block">plays</span>
                  </div>

                  <div className="w-7 h-7 rounded-xl bg-white/5 group-hover:bg-[#6045F4] text-[#8E9AA7] group-hover:text-white flex items-center justify-center transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};
