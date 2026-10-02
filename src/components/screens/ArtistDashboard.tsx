import React, { useState, useMemo } from 'react';
import { Track, Gig, Testimonial, UserProfile, DavaoArtist } from '../../types';
import { 
  DAVAO_ARTISTS_LIST, 
  MOCK_FEATURED_BANDS, 
  MOCK_TESTIMONIALS 
} from '../../data/mockData';
import { 
  Play, 
  Pause, 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  Disc, 
  ArrowLeft,
  Camera,
  Star,
  Sparkles,
  ChevronRight,
  Send,
  Radio,
  FileText,
  Check,
  Plus
} from 'lucide-react';

interface ArtistDashboardProps {
  artistProfile: UserProfile;
  tracks: Track[];
  gigs: Gig[];
  testimonials?: Testimonial[];
  currentTrack: Track;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onTogglePlay: () => void;
  onAddTrack?: (newTrack: Track) => void;
  onAddTestimonial?: (newTestimonial: Testimonial) => void;
  onRsvpGig?: (gigId: string) => void;
  onBack?: () => void;
  onSelectArtist?: (artistId: string) => void;
}

export const ArtistDashboard: React.FC<ArtistDashboardProps> = ({
  artistProfile,
  tracks,
  gigs,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onTogglePlay,
  onBack,
  onSelectArtist,
}) => {
  // Selected lyrics modal
  const [activeLyricsTrack, setActiveLyricsTrack] = useState<Track | null>(null);
  const [isFollowingBand, setIsFollowingBand] = useState(true);

  // Local testimonials state for live reactions & review submission
  const [testimonialsList, setTestimonialsList] = useState<Testimonial[]>(MOCK_TESTIMONIALS);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [fanNameInput, setFanNameInput] = useState('');
  const [fanMessageInput, setFanMessageInput] = useState('');
  const [fanRatingInput, setFanRatingInput] = useState(5);

  // Filter tracks specific to this artist, fallback to all tracks if none matched
  const artistTracks = useMemo(() => {
    const matched = tracks.filter(
      (t) => t.artistId === artistProfile.id || t.artist.toLowerCase().includes(artistProfile.name.toLowerCase())
    );
    return matched.length > 0 ? matched : tracks;
  }, [tracks, artistProfile]);

  // Filter gigs specific to this artist, fallback to all gigs
  const artistGigs = useMemo(() => {
    const matched = gigs.filter(
      (g) => g.bandName.toLowerCase().includes(artistProfile.name.toLowerCase())
    );
    return matched.length > 0 ? matched : gigs;
  }, [gigs, artistProfile]);

  // Latest Gig Poster (first gig in the schedule)
  const latestGig = artistGigs[0] || gigs[0];

  // Gallery Photos (2-3 high resolution live concert & studio photos)
  const galleryPhotos = useMemo(() => {
    const featured = MOCK_FEATURED_BANDS.find(
      (b) => b.id === artistProfile.id || b.name.toLowerCase().includes(artistProfile.name.toLowerCase())
    );
    if (featured && featured.images && featured.images.length >= 2) {
      return featured.images.slice(0, 3).map((img, i) => ({
        url: img,
        title: i === 0 ? 'Live at Matina Town Square' : i === 1 ? 'Analog Studio Sessions' : 'Torres Night Blockout',
        tag: i === 0 ? 'MTS Taboan' : i === 1 ? 'Davao Studio' : 'Torres St.',
      }));
    }
    return [
      {
        url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&auto=format&fit=crop&q=80',
        title: 'Headline Show at MTS Taboan',
        tag: 'Live Stage',
      },
      {
        url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=80',
        title: 'Studio Rehearsal & Track Demo',
        tag: 'Rehearsal Room',
      },
      {
        url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop&q=80',
        title: 'Davao Underground Soundstage',
        tag: 'Night Jam',
      },
    ];
  }, [artistProfile]);

  // Similar Genre Bands (matching genre or related southern bands)
  const similarGenreBands = useMemo(() => {
    const currentPrimaryGenre = (artistProfile.genres?.[0] || 'Rock').toLowerCase();
    return DAVAO_ARTISTS_LIST.filter(
      (b) => b.id !== artistProfile.id && b.name.toLowerCase() !== artistProfile.name.toLowerCase() &&
      (b.genre.toLowerCase().includes(currentPrimaryGenre.split('/')[0].trim()) ||
       b.genre.toLowerCase().includes('rock') ||
       b.genre.toLowerCase().includes('indie'))
    ).slice(0, 3);
  }, [artistProfile]);

  // Random Suggested Bands (other Davao City artists)
  const randomSuggestedBands = useMemo(() => {
    return DAVAO_ARTISTS_LIST.filter(
      (b) => b.id !== artistProfile.id && b.name.toLowerCase() !== artistProfile.name.toLowerCase() &&
      !similarGenreBands.some((sb) => sb.id === b.id)
    ).slice(0, 3);
  }, [artistProfile, similarGenreBands]);

  // Calculate Total Listens / Views
  const totalViewsListens = useMemo(() => {
    const basePlays = artistTracks.reduce((sum, t) => sum + (t.plays || 0), 0);
    const monthly = artistProfile.monthlyListeners || 58400;
    return Math.max(basePlays * 3 + monthly * 2, 218400);
  }, [artistTracks, artistProfile]);

  // Testimonial reaction toggle
  const handleTestimonialReaction = (testId: string, reactionKey: 'fire' | 'rock' | 'orchid') => {
    setTestimonialsList((prev) =>
      prev.map((t) => {
        if (t.id === testId) {
          return {
            ...t,
            reactions: {
              ...t.reactions,
              [reactionKey]: (t.reactions[reactionKey] || 0) + 1,
            },
          };
        }
        return t;
      })
    );
  };

  // Submit fan review
  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fanMessageInput.trim()) return;

    const newTestimonial: Testimonial = {
      id: `test-${Date.now()}`,
      fanName: fanNameInput.trim() || 'Davao Music Fan',
      fanAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      fanRole: 'Local Scene Explorer',
      date: 'Just now',
      message: fanMessageInput.trim(),
      rating: fanRatingInput,
      reactions: { fire: 1, rock: 1, orchid: 0 },
    };

    setTestimonialsList((prev) => [newTestimonial, ...prev]);
    setFanNameInput('');
    setFanMessageInput('');
    setShowReviewForm(false);
  };

  return (
    <div className="min-h-screen pb-32 pt-2 px-3 sm:px-6 max-w-4xl mx-auto space-y-7 text-[#EBEBED]">
      
      {/* 0. Top Back Button */}
      {onBack && (
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            id="back-to-audio-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161B20] hover:bg-white/10 text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-[#53E6D4]" />
            <span>Back to Audio & Bands</span>
          </button>
          <span className="text-[11px] font-mono text-[#8E9AA7]">
            Band Main Profile
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HERO BANNER & BAND IDENTITY                                            */}
      {/* ========================================================================= */}
      <section className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-[#161B20] border border-white/10 shadow-2xl">
        {/* Large Stage Photo Banner */}
        <div className="h-48 sm:h-64 lg:h-72 w-full relative">
          <img
            src={
              galleryPhotos[0]?.url ||
              artistProfile.avatar ||
              'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1600&auto=format&fit=crop&q=80'
            }
            alt={`${artistProfile.name} Stage Banner`}
            className="w-full h-full object-cover object-center filter brightness-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-[#161B20]/45 to-transparent" />
        </div>

        {/* Band Identity: Name, Genres, Address, Bio, and Adjusted Metrics */}
        <div className="px-4 pb-5 sm:px-7 sm:pb-7 -mt-10 sm:-mt-12 relative z-10 space-y-4">
          <div className="space-y-2">
            {/* Band Name & Follow Button */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-extrabold text-white tracking-tight drop-shadow-md">
                {artistProfile.name}
              </h1>

              <button
                type="button"
                onClick={() => setIsFollowingBand(!isFollowingBand)}
                id="band-follow-btn"
                className={`px-3.5 py-1.5 rounded-xl font-heading font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md ${
                  isFollowingBand
                    ? 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/20'
                    : 'bg-[#53E6D4] text-[#0F1417] hover:bg-[#6efae9] shadow-[0_0_12px_rgba(83,230,212,0.4)]'
                }`}
              >
                {isFollowingBand ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#53E6D4]" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Follow Band</span>
                  </>
                )}
              </button>
            </div>

            {/* Southern Mindanao & Genre Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-[#6045F4] text-white text-[10px] font-bold shadow-sm">
                Southern Mindanao
              </span>
              {artistProfile.genres?.map((g) => (
                <span
                  key={g}
                  className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/10 font-semibold"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Address placed cleanly below Southern Mindanao / Genre as requested */}
            <div className="flex items-center gap-1.5 text-xs text-[#53E6D4] pt-0.5">
              <MapPin className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />
              <span className="font-semibold tracking-wide">
                {artistProfile.district || 'Matina & Buhangin, Davao City, Southern Mindanao'}
              </span>
            </div>

            {/* Band Bio */}
            <p className="text-xs sm:text-sm text-[#8E9AA7] pt-1 leading-relaxed max-w-2xl">
              {artistProfile.bio}
            </p>
          </div>

          {/* Adjusted Metrics Bar: Compact and much smaller font */}
          <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-white/10">
            <div className="px-3 py-2 rounded-xl bg-[#0F1417] border border-white/5 space-y-0.5 shadow-inner">
              <p className="text-[9px] sm:text-[10px] text-[#8E9AA7] font-medium uppercase tracking-wider">
                Monthly Listeners
              </p>
              <p className="text-xs sm:text-sm font-heading font-bold text-[#53E6D4]">
                {(artistProfile.monthlyListeners || 58400).toLocaleString()}
              </p>
              <p className="text-[8px] sm:text-[9px] text-[#8E9AA7]">Davao City & Southern Mindanao</p>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#0F1417] border border-white/5 space-y-0.5 shadow-inner">
              <p className="text-[9px] sm:text-[10px] text-[#8E9AA7] font-medium uppercase tracking-wider">
                Total Views & Listens
              </p>
              <p className="text-xs sm:text-sm font-heading font-bold text-white">
                {totalViewsListens.toLocaleString()}
              </p>
              <p className="text-[8px] sm:text-[9px] text-[#8E9AA7]">Streams across local platforms</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. BAND PHOTO GALLERY (2 or 3 Photos)                                    */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#53E6D4]" />
            <h2 className="text-sm font-heading font-extrabold uppercase tracking-wider text-white">
              Band Gallery & Stage Photos
            </h2>
          </div>
          <span className="text-[10px] text-[#8E9AA7]">3 Photos</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {galleryPhotos.map((photo, idx) => (
            <div
              key={idx}
              className="group relative h-44 sm:h-48 rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-[#161B20]"
            >
              <img
                src={photo.url}
                alt={photo.title}
                className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-300 filter brightness-90 group-hover:brightness-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2.5 left-3 right-3 space-y-0.5">
                <span className="inline-block px-1.5 py-0.5 rounded bg-[#6045F4]/80 text-[8px] font-bold text-white uppercase tracking-wider">
                  {photo.tag}
                </span>
                <p className="text-xs font-heading font-bold text-white truncate">
                  {photo.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. UPLOADED TRACKS (With In-Place Notification, NO Pop-up Player)         */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="px-1">
          <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
            <Disc className="w-3.5 h-3.5 text-[#6045F4]" />
            <span>Uploaded Music & Master Tracks</span>
          </h2>
          <p className="text-[10px] text-[#8E9AA7] mt-0.5">
            Stream master demos directly from the band
          </p>
        </div>

        {/* In-Place Audio Notification Banner (Shows when playing, strictly inline) */}
        {isPlaying && (
          <div className="p-3 rounded-2xl bg-gradient-to-r from-[#6045F4]/25 via-[#161B20] to-[#53E6D4]/20 border border-[#53E6D4]/40 flex items-center justify-between gap-3 shadow-lg animate-fadeIn">
            <div className="flex items-center gap-3 min-w-0">
              {/* Equalizer Waveform Bars */}
              <div className="flex items-end gap-1 h-5 flex-shrink-0 px-1">
                <span className="w-1 bg-[#53E6D4] rounded-full animate-bounce h-3" />
                <span className="w-1 bg-[#53E6D4] rounded-full animate-bounce h-5" style={{ animationDelay: '0.15s' }} />
                <span className="w-1 bg-[#53E6D4] rounded-full animate-bounce h-2" style={{ animationDelay: '0.3s' }} />
                <span className="w-1 bg-[#53E6D4] rounded-full animate-bounce h-4" style={{ animationDelay: '0.45s' }} />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-ping" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#53E6D4]">
                    Now Playing
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-heading font-bold text-white truncate">
                  {currentTrack.title}
                </p>
              </div>
            </div>

            <button
              onClick={onTogglePlay}
              className="px-3 py-1.5 rounded-xl bg-[#53E6D4] text-[#0F1417] text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-white transition-all cursor-pointer flex-shrink-0"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </button>
          </div>
        )}

        {/* Tracks List */}
        <div className="space-y-2">
          {artistTracks.map((track, idx) => {
            const isThisPlaying = isPlaying && currentTrack.id === track.id;
            return (
              <div
                key={track.id}
                className={`p-3 rounded-2xl transition-all duration-200 flex items-center justify-between gap-2.5 border ${
                  isThisPlaying
                    ? 'bg-[#1D232A] border-[#53E6D4] shadow-[0_0_15px_rgba(83,230,212,0.25)]'
                    : 'bg-[#161B20] border-white/5 hover:border-white/20 hover:bg-[#1D232A]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Track Number */}
                  <span className="text-xs font-mono text-[#8E9AA7] w-4 text-center hidden sm:inline-block">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  {/* Play Button */}
                  <button
                    onClick={() => {
                      if (currentTrack.id === track.id) {
                        onTogglePlay();
                      } else {
                        onPlayTrack(track);
                      }
                    }}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer flex-shrink-0 active:scale-95 ${
                      isThisPlaying
                        ? 'bg-[#53E6D4] text-[#0F1417] shadow-md shadow-[#53E6D4]/40'
                        : 'bg-white/10 hover:bg-[#6045F4] text-white'
                    }`}
                    title={isThisPlaying ? 'Pause' : 'Play'}
                  >
                    {isThisPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current translate-x-0.5" />
                    )}
                  </button>

                  <img
                    src={track.albumArt}
                    alt={track.title}
                    className="w-10 h-10 rounded-xl object-cover border border-white/10 flex-shrink-0 shadow-sm"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-heading font-bold text-white truncate">
                        {track.title}
                      </p>
                      {isThisPlaying && (
                        <span className="px-1.5 py-0.5 rounded bg-[#53E6D4]/15 border border-[#53E6D4]/40 text-[#53E6D4] text-[9px] font-mono font-bold animate-pulse">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#8E9AA7]">
                      <span className="text-[#53E6D4] font-medium">{track.genre}</span>
                      <span>•</span>
                      <span>{track.plays.toLocaleString()} plays</span>
                    </div>
                  </div>
                </div>

                {/* Actions & Duration */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {track.lyricsSnippet && (
                    <button
                      onClick={() => setActiveLyricsTrack(track)}
                      className="hidden sm:flex items-center gap-1 text-[10px] text-[#8E9AA7] hover:text-[#53E6D4] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
                      title="View Liner Notes"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Lyrics</span>
                    </button>
                  )}
                  <span className="text-xs font-mono text-[#8E9AA7]">{track.duration}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. LATEST GIG SCHEDULE & EVENT POSTER                                    */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#FFB800]" />
            <h2 className="text-sm font-heading font-extrabold uppercase tracking-wider text-white">
              Latest Gig Poster & Schedules
            </h2>
          </div>
          <span className="text-[10px] text-[#53E6D4] font-mono font-bold">
            {artistGigs.length} Upcoming Dates
          </span>
        </div>

        {/* Featured Gig Poster Card */}
        {latestGig && (
          <div className="rounded-3xl overflow-hidden bg-[#161B20] border border-white/10 shadow-2xl space-y-0">
            {/* Poster Image / Concert Flyer */}
            <div className="relative h-56 sm:h-72 w-full overflow-hidden">
              <img
                src={latestGig.coverImage}
                alt={`${latestGig.title} Official Poster`}
                className="w-full h-full object-cover object-center filter brightness-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-black/30 to-transparent" />

              {/* Poster Bottom Info */}
              <div className="absolute bottom-3 left-3.5 right-3.5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#FFB800] uppercase tracking-wider block">
                  {latestGig.dayOfWeek} • {latestGig.date}
                </span>
                <h3 className="text-lg sm:text-xl font-heading font-extrabold text-white tracking-tight drop-shadow-md">
                  {latestGig.title}
                </h3>
              </div>
            </div>

            {/* Poster Details */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#53E6D4] flex-shrink-0" />
                  <div>
                    <span className="text-white font-bold block">{latestGig.venue}</span>
                    <span className="text-[11px] text-[#8E9AA7] block">{latestGig.address}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:justify-end">
                  <Clock className="w-4 h-4 text-[#8E9AA7] flex-shrink-0" />
                  <span className="text-slate-300">{latestGig.time}</span>
                </div>
              </div>

              {/* Attendee Info */}
              <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 text-xs text-[#8E9AA7]">
                <Users className="w-4 h-4 text-[#FFB800]" />
                <span className="text-white font-semibold">{latestGig.rsvpCount}</span>
                <span>fans attending</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. FAN TESTIMONIALS                                                      */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#FFB800]" />
            <h2 className="text-sm font-heading font-extrabold uppercase tracking-wider text-white">
              Davao Fan Testimonials
            </h2>
          </div>
          <button
            onClick={() => setShowReviewForm((prev) => !prev)}
            className="text-[11px] text-[#53E6D4] hover:underline font-semibold cursor-pointer"
          >
            {showReviewForm ? 'Cancel' : '+ Leave a Review'}
          </button>
        </div>

        {/* Submit Review Form */}
        {showReviewForm && (
          <form onSubmit={handleSubmitReview} className="p-4 rounded-2xl bg-[#161B20] border border-white/10 space-y-3 animate-fadeIn">
            <h4 className="text-xs font-heading font-bold text-white">Write a Review for {artistProfile.name}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Your Name (or Nickname)"
                value={fanNameInput}
                onChange={(e) => setFanNameInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-[#0F1417] border border-white/10 text-xs text-white focus:outline-none focus:border-[#6045F4]"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8E9AA7]">Rating:</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFanRatingInput(star)}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        star <= fanRatingInput ? 'text-[#FFB800] fill-current' : 'text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              placeholder="What do you love about their live energy, songs, or Davao gigs?..."
              rows={2}
              required
              value={fanMessageInput}
              onChange={(e) => setFanMessageInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-xs text-white focus:outline-none focus:border-[#6045F4]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Fan Testimonial</span>
            </button>
          </form>
        )}

        {/* Testimonials List */}
        <div className="space-y-3">
          {testimonialsList.map((test) => (
            <div
              key={test.id}
              className="p-4 rounded-2xl bg-[#161B20] border border-white/5 hover:border-white/15 transition-all shadow-md space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src={test.fanAvatar}
                    alt={test.fanName}
                    className="w-10 h-10 rounded-full object-cover border border-white/10"
                  />
                  <div>
                    <h4 className="text-xs sm:text-sm font-heading font-bold text-white">
                      {test.fanName}
                    </h4>
                    <p className="text-[10px] text-[#53E6D4]">{test.fanRole}</p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  {[...Array(test.rating)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 text-[#FFB800] fill-current" />
                  ))}
                </div>
              </div>

              <p className="text-xs text-[#8E9AA7] leading-relaxed italic">
                "{test.message}"
              </p>

              {/* Reactions Bar */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-[#8E9AA7]">
                <span className="text-[10px]">{test.date}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTestimonialReaction(test.id, 'fire')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-xs cursor-pointer transition-colors"
                  >
                    <span>🔥</span>
                    <span className="text-[10px]">{test.reactions.fire}</span>
                  </button>
                  <button
                    onClick={() => handleTestimonialReaction(test.id, 'rock')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-xs cursor-pointer transition-colors"
                  >
                    <span>🤘</span>
                    <span className="text-[10px]">{test.reactions.rock}</span>
                  </button>
                  <button
                    onClick={() => handleTestimonialReaction(test.id, 'orchid')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-xs cursor-pointer transition-colors"
                  >
                    <span>🌸</span>
                    <span className="text-[10px]">{test.reactions.orchid}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. SUGGESTED BANDS: SIMILAR GENRE & RANDOM SUGGESTED BANDS                 */}
      {/* ========================================================================= */}
      <section className="space-y-5 pt-2">
        {/* Subsection A: Similar Genre Bands */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#6045F4]" />
              <h2 className="text-sm font-heading font-extrabold uppercase tracking-wider text-white">
                Similar Genre Bands
              </h2>
            </div>
            <span className="text-[10px] text-[#8E9AA7]">You might also love</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {similarGenreBands.map((band) => (
              <div
                key={band.id}
                onClick={() => onSelectArtist?.(band.id)}
                className="group p-3 rounded-2xl bg-[#161B20] hover:bg-[#1C2228] border border-white/5 hover:border-[#6045F4]/60 transition-all cursor-pointer shadow-lg space-y-2"
              >
                <div className="relative h-28 rounded-xl overflow-hidden">
                  <img
                    src={band.avatar}
                    alt={band.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-2 left-2 text-[9px] px-2 py-0.5 rounded bg-[#6045F4]/90 text-white font-semibold">
                    {band.genre}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs sm:text-sm font-heading font-bold text-white group-hover:text-[#53E6D4] transition-colors truncate">
                    {band.name}
                  </h4>
                  <p className="text-[10px] text-[#8E9AA7] truncate flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-[#53E6D4]" />
                    <span>{band.district}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#53E6D4] font-semibold pt-1 border-t border-white/5">
                  <span>View Profile</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subsection B: Random Suggested Bands */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#53E6D4]" />
              <h2 className="text-sm font-heading font-extrabold uppercase tracking-wider text-white">
                Random Suggested Davao Bands
              </h2>
            </div>
            <span className="text-[10px] text-[#8E9AA7]">Explore the city</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {randomSuggestedBands.map((band) => (
              <div
                key={band.id}
                onClick={() => onSelectArtist?.(band.id)}
                className="group p-3 rounded-2xl bg-[#161B20] hover:bg-[#1C2228] border border-white/5 hover:border-[#53E6D4]/50 transition-all cursor-pointer shadow-lg space-y-2"
              >
                <div className="relative h-28 rounded-xl overflow-hidden">
                  <img
                    src={band.avatar}
                    alt={band.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-2 left-2 text-[9px] px-2 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/10 text-[#53E6D4] font-semibold">
                    {band.genre}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs sm:text-sm font-heading font-bold text-white group-hover:text-[#53E6D4] transition-colors truncate">
                    {band.name}
                  </h4>
                  <p className="text-[10px] text-[#8E9AA7] truncate flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-[#53E6D4]" />
                    <span>{band.district}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#53E6D4] font-semibold pt-1 border-t border-white/5">
                  <span>Visit Band Page</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lyrics / Liner Notes Modal */}
      {activeLyricsTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl p-5 sm:p-6 border border-white/20 shadow-2xl relative bg-[#161B20] text-[#EBEBED] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#53E6D4]">
                Liner Notes & Lyrics
              </span>
              <button
                onClick={() => setActiveLyricsTrack(null)}
                className="text-[#8E9AA7] hover:text-white text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <h3 className="text-base font-heading font-extrabold text-white">
              {activeLyricsTrack.title}
            </h3>

            <div className="p-3.5 rounded-2xl bg-[#0F1417] border border-white/5 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
              {activeLyricsTrack.lyricsSnippet}
            </div>

            <button
              onClick={() => setActiveLyricsTrack(null)}
              className="w-full py-2 rounded-xl bg-[#6045F4] text-white text-xs font-bold cursor-pointer"
            >
              Done Reading
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
