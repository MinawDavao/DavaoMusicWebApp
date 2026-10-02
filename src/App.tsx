import React, { useState } from 'react';
import { ScreenType, UserRole, Track, Gig, Testimonial, FeedPost, MarketplaceItem } from './types';
import { 
  CURRENT_ARTIST_PROFILE, 
  CURRENT_FAN_PROFILE, 
  DAVAO_ARTISTS_LIST,
  MOCK_TRACKS, 
  MOCK_GIGS, 
  MOCK_TESTIMONIALS, 
  MOCK_FEED_POSTS, 
  MOCK_GALLERY, 
  MOCK_MARKETPLACE 
} from './data/mockData';
import { Navbar } from './components/Navbar';
import { HomeScreen } from './components/screens/HomeScreen';
import { AudioScreen } from './components/screens/AudioScreen';
import { AuthScreen } from './components/screens/AuthScreen';
import { ArtistDashboard } from './components/screens/ArtistDashboard';
import { FanDashboard } from './components/screens/FanDashboard';
import { FanProfileScreen } from './components/screens/FanProfileScreen';
import { MarketplaceScreen } from './components/screens/MarketplaceScreen';
import { 
  Home,
  Headphones, 
  Radio, 
  Tag, 
  Music, 
  Smartphone,
  Tablet,
  Monitor,
  Wifi,
  BatteryCharging
} from 'lucide-react';

type ViewMode = 'mobile' | 'wide' | 'responsive';

export default function App() {
  // View mode state - default to 'mobile' view focus as requested
  const [viewMode, setViewMode] = useState<ViewMode>('mobile');

  // Navigation & Role State (Default to Home in unauthenticated common view)
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeRole, setActiveRole] = useState<UserRole>('fan');

  // Profiles State
  const [artistProfile, setArtistProfile] = useState(CURRENT_ARTIST_PROFILE);
  const [fanProfile, setFanProfile] = useState(CURRENT_FAN_PROFILE);

  // Core Data Collections
  const [tracks, setTracks] = useState<Track[]>(MOCK_TRACKS);
  const [gigs, setGigs] = useState<Gig[]>(MOCK_GIGS);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(MOCK_FEED_POSTS);
  const [gallery, setGallery] = useState(MOCK_GALLERY);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>(MOCK_MARKETPLACE);

  // Audio Playback State (for explicit playback in audio/artist tabs)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentTrack = tracks[currentTrackIndex] || tracks[0];

  // Role Switcher
  const handleToggleRole = () => {
    const newRole: UserRole = activeRole === 'artist' ? 'fan' : 'artist';
    setActiveRole(newRole);
  };

  // Auth Screen Login/Signup handler
  const handleLoginSuccess = (role: UserRole, customName?: string) => {
    setIsLoggedIn(true);
    setActiveRole(role);
    if (role === 'artist') {
      if (customName) {
        setArtistProfile((prev) => ({ ...prev, name: customName }));
      }
      setCurrentScreen('artist');
    } else {
      if (customName) {
        setFanProfile((prev) => ({ ...prev, name: customName }));
      }
      setCurrentScreen('fan');
    }
  };

  // Logout handler to return to common guest view
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentScreen('home');
  };

  // Track playback handlers
  const handlePlayTrack = (track: Track) => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      setCurrentTrackIndex(idx);
      setIsPlaying(true);
    }
  };

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleAddTrack = (newTrack: Track) => {
    setTracks((prev) => [newTrack, ...prev]);
    setCurrentTrackIndex(0);
  };

  const handleRsvpGig = (gigId: string) => {
    setGigs((prev) =>
      prev.map((gig) => {
        if (gig.id === gigId) {
          const isNowRsvpd = !gig.isUserRsvpd;
          return {
            ...gig,
            isUserRsvpd: isNowRsvpd,
            rsvpCount: isNowRsvpd ? gig.rsvpCount + 1 : gig.rsvpCount - 1,
          };
        }
        return gig;
      })
    );
  };

  // Fan Feed reaction counter
  const handleReactionClick = (postId: string, reactionKey: 'rock' | 'fire' | 'orchid' | 'durian') => {
    setFeedPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const alreadyReacted = post.userReactions.includes(reactionKey);
          const updatedUserReactions = alreadyReacted
            ? post.userReactions.filter((k) => k !== reactionKey)
            : [...post.userReactions, reactionKey];

          return {
            ...post,
            reactions: {
              ...post.reactions,
              [reactionKey]: alreadyReacted
                ? Math.max(0, post.reactions[reactionKey] - 1)
                : post.reactions[reactionKey] + 1,
            },
            userReactions: updatedUserReactions,
          };
        }
        return post;
      })
    );
  };

  const handleAddFeedPost = (newPost: FeedPost) => {
    setFeedPosts((prev) => [newPost, ...prev]);
  };

  const handleAddMarketplaceItem = (newItem: MarketplaceItem) => {
    setMarketplaceItems((prev) => [newItem, ...prev]);
  };

  // When user clicks "Visit Band Page" or selects an artist
  const handleSelectArtist = (artistId: string) => {
    const found = DAVAO_ARTISTS_LIST.find((a) => a.id === artistId);
    if (found) {
      setArtistProfile((prev) => ({
        ...prev,
        id: found.id,
        name: found.name,
        handle: found.handle,
        avatar: found.avatar,
        bio: found.bio,
        district: found.district,
        monthlyListeners: found.monthlyListeners,
        genres: [found.genre, 'Southern Mindanao'],
      }));

      // Queue the band's top track if present in tracks collection
      const bandTrackIdx = tracks.findIndex(
        (t) => t.artistId === found.id || t.artist.toLowerCase().includes(found.name.toLowerCase())
      );
      if (bandTrackIdx !== -1) {
        setCurrentTrackIndex(bandTrackIdx);
      }
    }
    setCurrentScreen('artist');
  };

  // Container styling based on viewMode
  const containerClass = 
    viewMode === 'mobile'
      ? 'w-full max-w-[430px] mx-auto min-h-screen sm:min-h-[860px] sm:my-4 sm:rounded-[38px] sm:border sm:border-white/15 sm:shadow-[0_20px_80px_rgba(0,0,0,0.9),0_0_60px_rgba(96,69,244,0.2)] relative flex flex-col bg-[#0F1417]'
      : viewMode === 'wide'
      ? 'w-full max-w-[540px] mx-auto min-h-screen sm:min-h-[860px] sm:my-4 sm:rounded-[32px] sm:border sm:border-white/15 sm:shadow-[0_20px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(96,69,244,0.15)] relative flex flex-col bg-[#0F1417]'
      : 'w-full min-h-screen flex flex-col bg-[#0F1417]';

  return (
    <div className="min-h-screen bg-[#07090D] text-[#EBEBED] font-sans selection:bg-[#6045F4] selection:text-white flex flex-col">
      {/* 0. Top Viewport Controller Bar (Subtle & Ergonomic) */}
      <aside aria-label="Device viewport switcher" className="w-full bg-[#161B20]/90 backdrop-blur-md border-b border-white/10 px-3 py-2 flex items-center justify-between text-xs z-50 sticky top-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-pulse" />
          <span className="font-heading font-bold text-[11px] tracking-wide">
            <span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span>
          </span>
          <span className="hidden sm:inline text-[#8E9AA7] text-[10px]">• Mobile Experience Focus</span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#0F1417] p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setViewMode('mobile')}
            title="Focus on Mobile View (430px)"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
              viewMode === 'mobile'
                ? 'bg-[#6045F4] text-white shadow-[0_0_10px_rgba(96,69,244,0.5)]'
                : 'text-[#8E9AA7] hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile</span>
          </button>

          <button
            onClick={() => setViewMode('wide')}
            title="Wide Mobile View (540px)"
            className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
              viewMode === 'wide'
                ? 'bg-[#6045F4] text-white shadow-[0_0_10px_rgba(96,69,244,0.5)]'
                : 'text-[#8E9AA7] hover:text-white'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>Wide</span>
          </button>

          <button
            onClick={() => setViewMode('responsive')}
            title="Full Screen Responsive View"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
              viewMode === 'responsive'
                ? 'bg-[#6045F4] text-white shadow-[0_0_10px_rgba(96,69,244,0.5)]'
                : 'text-[#8E9AA7] hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fluid</span>
          </button>
        </div>
      </aside>

      {/* Main Container / Mobile Device Simulator Wrapper */}
      <div className={containerClass}>
        {/* Mobile Device Status Bar (Visible in mobile/wide frame on desktop) */}
        {(viewMode === 'mobile' || viewMode === 'wide') && (
          <div className="hidden sm:flex items-center justify-between px-6 pt-3 pb-1 text-[11px] text-[#8E9AA7] font-semibold border-b border-white/5 bg-[#0F1417] select-none">
            <span>9:41</span>
            {/* Dynamic Island Capsule */}
            <div className="w-20 h-4 bg-black rounded-full border border-white/10 flex items-center justify-center gap-1 px-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#53E6D4]" />
              <span className="text-[8px] text-white/70">Davao 5G</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/70">
              <Wifi className="w-3 h-3" />
              <BatteryCharging className="w-3.5 h-3.5 text-[#53E6D4]" />
            </div>
          </div>
        )}

        {/* 1. Header with Logo, Name & lined up Home, Audio, Connect, Deals */}
        <Navbar
          currentScreen={currentScreen}
          onSelectScreen={setCurrentScreen}
          activeRole={activeRole}
          onToggleRole={handleToggleRole}
          userName={activeRole === 'artist' ? artistProfile.name : fanProfile.name}
          userAvatar={activeRole === 'artist' ? artistProfile.avatar : fanProfile.avatar}
          isLoggedIn={isLoggedIn}
          onLogout={handleLogout}
        />

        {/* 2. Main Active Screen View */}
        <main className="flex-1 w-full">
          {/* HOME TAB */}
          {currentScreen === 'home' && (
            <HomeScreen
              tracks={tracks}
              gigs={gigs}
              onSelectArtist={handleSelectArtist}
              onNavigateToScreen={setCurrentScreen}
              onRsvpGig={handleRsvpGig}
            />
          )}

          {/* AUDIO TAB: Genre Search, Search Button Option, Featured Band, Top 10 Band */}
          {currentScreen === 'audio' && (
            <AudioScreen
              tracks={tracks}
              onSelectArtist={handleSelectArtist}
            />
          )}

          {/* BAND MAIN PROFILE PAGE (When user clicks on a band or searches and clicks) */}
          {currentScreen === 'artist' && (
            <ArtistDashboard
              artistProfile={artistProfile}
              tracks={tracks}
              gigs={gigs}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlayTrack={handlePlayTrack}
              onTogglePlay={handleTogglePlay}
              onAddTrack={handleAddTrack}
              onRsvpGig={handleRsvpGig}
              onBack={() => setCurrentScreen('audio')}
              onSelectArtist={handleSelectArtist}
            />
          )}

          {/* CONNECT TAB: Facebook Home Feed (Bands & Fans) */}
          {currentScreen === 'connect' && (
            <FanDashboard
              fanProfile={fanProfile}
              feedPosts={feedPosts}
              gallery={gallery}
              onReactionClick={handleReactionClick}
              onAddFeedPost={handleAddFeedPost}
              onSelectArtist={handleSelectArtist}
              onNavigateToAuth={() => setCurrentScreen('auth')}
              isLoggedIn={isLoggedIn}
            />
          )}

          {/* FAN PROFILE SCREEN (When clicking user profile avatar as Fan) */}
          {currentScreen === 'fan' && (
            <FanProfileScreen
              fanProfile={fanProfile}
              onUpdateFanProfile={(updated) => setFanProfile(updated)}
              gigs={gigs}
              feedPosts={feedPosts}
              tracks={tracks}
              onSelectArtist={handleSelectArtist}
              onNavigateToScreen={setCurrentScreen}
              onLogout={handleLogout}
              onRsvpGig={handleRsvpGig}
            />
          )}

          {/* DEALS TAB */}
          {(currentScreen === 'deals' || currentScreen === 'marketplace') && (
            <MarketplaceScreen
              items={marketplaceItems}
              onAddItem={handleAddMarketplaceItem}
              currentUserName={activeRole === 'artist' ? artistProfile.name : fanProfile.name}
              currentUserAvatar={activeRole === 'artist' ? artistProfile.avatar : fanProfile.avatar}
              currentUserDistrict={activeRole === 'artist' ? artistProfile.district : fanProfile.district}
              onSelectArtist={handleSelectArtist}
              isLoggedIn={isLoggedIn}
              onNavigateToAuth={() => setCurrentScreen('auth')}
            />
          )}

          {/* AUTH / PORTAL */}
          {currentScreen === 'auth' && (
            <AuthScreen
              onLoginSuccess={handleLoginSuccess}
              onNavigateToScreen={setCurrentScreen}
            />
          )}
        </main>

        {/* 3. Cultural Footer */}
        <footer className="pb-24 pt-8 border-t border-white/10 bg-[#161B20] text-[#8E9AA7] text-xs px-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#6045F4] flex items-center justify-center text-white">
                <Music className="w-3.5 h-3.5" />
              </div>
              <span className="font-heading font-bold text-sm tracking-tight">
                <span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span>
              </span>
            </div>
            <p className="text-[11px] text-[#8E9AA7] leading-relaxed">
              Dedicated local music platform for Davao City & Southern Mindanao. Connect with local bands, discover gigs, and grab exclusive gear deals.
            </p>
            <div className="flex flex-wrap gap-2 text-[10px] text-[#53E6D4]">
              <span className="bg-[#6045F4]/20 px-2 py-0.5 rounded-full border border-[#6045F4]/30">Southern Mindanao</span>
              <span className="bg-[#53E6D4]/15 px-2 py-0.5 rounded-full border border-[#53E6D4]/30 text-[#53E6D4]">MTS Live</span>
              <span className="bg-white/5 px-2 py-0.5 rounded-full border border-white/10 text-white">Top 10 Davao Artists</span>
            </div>
            <p className="text-[10px] text-slate-500 pt-2 border-t border-white/5">
              © 2026 MINAW DVO • Made for Davao musicians and fans.
            </p>
          </div>
        </footer>

        {/* 4. Mobile Bottom Navigation Bar: Home, Audio, Connect, Deals */}
        <nav 
          aria-label="Mobile navigation" 
          className="fixed bottom-2 left-0 right-0 z-40 mx-auto max-w-[420px] px-3 pointer-events-none"
        >
          <div className="pointer-events-auto bg-[#161B20]/95 backdrop-blur-2xl rounded-2xl border border-white/15 p-1.5 flex items-center justify-around shadow-[0_10px_35px_rgba(0,0,0,0.8),0_0_20px_rgba(96,69,244,0.3)]">
            <button
              onClick={() => setCurrentScreen('home')}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                currentScreen === 'home'
                  ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]'
                  : 'text-[#8E9AA7] hover:text-white'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>

            <button
              onClick={() => setCurrentScreen('audio')}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                currentScreen === 'audio' || currentScreen === 'artist'
                  ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]'
                  : 'text-[#8E9AA7] hover:text-white'
              }`}
            >
              <Headphones className="w-4 h-4" />
              <span>Audio</span>
            </button>

            <button
              onClick={() => setCurrentScreen('connect')}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                currentScreen === 'connect' || currentScreen === 'fan'
                  ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]'
                  : 'text-[#8E9AA7] hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Connect</span>
            </button>

            <button
              onClick={() => setCurrentScreen('deals')}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                currentScreen === 'deals' || currentScreen === 'marketplace'
                  ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]'
                  : 'text-[#8E9AA7] hover:text-white'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Deals</span>
            </button>
          </div>
        </nav>

        {/* Notice: Player card / pop up player has been removed as requested */}
      </div>
    </div>
  );
}
