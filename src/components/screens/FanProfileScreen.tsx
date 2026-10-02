import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserProfile, Gig, ScreenType, FeedPost, Track, Playlist } from '../../types';
import { 
  ShieldCheck, 
  MapPin, 
  Heart, 
  Music, 
  ArrowLeft, 
  Sparkles, 
  LogOut,
  Users,
  Play,
  Pause,
  Plus,
  ListMusic,
  ChevronDown,
  ChevronUp,
  Tag,
  MessageCircle,
  ThumbsUp,
  Flame,
  Check,
  X,
  Share2,
  Trash2,
  Disc,
  Clock,
  Radio,
  UserCheck,
  UserPlus,
  ExternalLink,
  Edit3,
  Camera,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { DAVAO_ARTISTS_LIST } from '../../data/mockData';
import { audioEngine } from '../../utils/audioSynth';

interface FanProfileScreenProps {
  fanProfile: UserProfile;
  onUpdateFanProfile?: (updated: UserProfile) => void;
  gigs: Gig[];
  feedPosts?: FeedPost[];
  tracks?: Track[];
  onSelectArtist: (artistId: string) => void;
  onNavigateToScreen: (screen: ScreenType) => void;
  onLogout?: () => void;
  onRsvpGig?: (gigId: string) => void;
}

interface CommunityUser {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  role: 'fan' | 'artist';
  district: string;
  bio: string;
  isFollowing?: boolean;
  bandId?: string;
  gigsAttended?: number;
}

// Preset avatars & covers for profile customization
const PRESET_AVATARS = [
  { label: 'Gig Explorer', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80' },
  { label: 'Indie Regular', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80' },
  { label: 'Bassist', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80' },
  { label: 'Photographer', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80' },
  { label: 'Sound Archivist', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80' },
];

const PRESET_COVERS = [
  { label: 'MTS Taboan Crowd', url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Live Concert Stage', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Suazo Stage Lights', url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Sunset Acoustic Set', url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200&auto=format&fit=crop&q=80' },
];

export const FanProfileScreen: React.FC<FanProfileScreenProps> = ({
  fanProfile,
  onUpdateFanProfile,
  gigs,
  feedPosts = [],
  tracks = [],
  onSelectArtist,
  onNavigateToScreen,
  onLogout,
}) => {
  // 0. Current fan profile state (editable)
  const [profile, setProfile] = useState<UserProfile>(fanProfile);

  useEffect(() => {
    setProfile(fanProfile);
  }, [fanProfile]);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editHandle, setEditHandle] = useState(profile.handle);
  const [editDistrict, setEditDistrict] = useState(profile.district);
  const [editBio, setEditBio] = useState(profile.bio);
  const [editAvatar, setEditAvatar] = useState(profile.avatar);
  const [editCoverImage, setEditCoverImage] = useState(
    profile.coverImage || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&auto=format&fit=crop&q=80'
  );

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setEditAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCoverFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setEditCoverImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 1. Bands Followed state (show partial initially + "Show All" toggle)
  const [showAllBands, setShowAllBands] = useState(false);
  const followedBandsList = useMemo(() => DAVAO_ARTISTS_LIST, []);
  const displayedBands = showAllBands ? followedBandsList : followedBandsList.slice(0, 5);

  // 2. All available uploaded audio tracks from bands
  const allBandTracks: Track[] = useMemo(() => {
    const list: Track[] = [...tracks];

    // Supplement with featured tracks from other local bands if not already present
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
      if (artist.id === 'caliber-45' || artist.id === 'artist-01') return;
      if (!artist.featuredTrackTitle) return;

      const durParts = (artist.featuredTrackDuration || '3:30').split(':');
      const min = parseInt(durParts[0], 10) || 3;
      const sec = parseInt(durParts[1], 10) || 30;
      const durSec = min * 60 + sec;

      list.push({
        id: `band-track-${artist.id}`,
        title: artist.featuredTrackTitle,
        artist: artist.name,
        artistId: artist.id,
        albumArt: artist.avatar,
        duration: artist.featuredTrackDuration || '3:30',
        durationSec: durSec,
        plays: artist.monthlyListeners || 12000,
        genre: artist.genre,
        releaseDate: 'Davao Local Upload',
        synthPreset: artistPresetMap[artist.id] || 'indie',
      });
    });

    return list;
  }, [tracks]);

  // 3. User Playlists state (selected from artists' uploaded music)
  const [playlists, setPlaylists] = useState<Playlist[]>([
    {
      id: 'pl-1',
      name: 'Davao BisRock Heat',
      description: 'Heavy guitar riffs and anthems straight from MTS Taboan & Buhangin.',
      coverImage: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
      trackIds: ['track-c45-1', 'track-c45-2', 'band-track-artist-09'],
      createdAt: 'Sep 2026',
      createdBy: fanProfile.name,
    },
    {
      id: 'pl-2',
      name: 'Midnight Roxas Indie Vibes',
      description: 'Dreamy guitars and evening echoes recorded under the Davao night sky.',
      coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
      trackIds: ['track-1', 'track-2', 'band-track-artist-02'],
      createdAt: 'Aug 2026',
      createdBy: fanProfile.name,
    },
    {
      id: 'pl-3',
      name: 'Gulf Reggae & Tribal Dub',
      description: 'Kulintang gongs meeting warm basslines over Samal waters.',
      coverImage: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80',
      trackIds: ['track-4', 'band-track-artist-03', 'band-track-artist-06'],
      createdAt: 'Jul 2026',
      createdBy: fanProfile.name,
    },
  ]);

  // Active playlist expanded view & playing track
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>('pl-1');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  // 4. Modal state for creating a new playlist
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  // 5. Activity log state
  const [activityLog, setActivityLog] = useState([
    {
      id: 'act-1',
      type: 'playlist_add',
      title: 'Added Pamalandong (Davao Rock Anthem) to "Davao BisRock Heat"',
      timeAgo: '12m ago',
      bandName: 'Caliber 45',
      bandId: 'caliber-45',
    },
    {
      id: 'act-2',
      type: 'like_song',
      title: 'Liked track "Gabi sa Roxas (Night Market Echoes)"',
      timeAgo: '1h ago',
      bandName: 'The Marfori Sound',
      bandId: 'artist-01',
    },
    {
      id: 'act-3',
      type: 'playlist_create',
      title: 'Created new playlist "Midnight Roxas Indie Vibes"',
      timeAgo: '3h ago',
    },
    {
      id: 'act-4',
      type: 'react_post',
      title: 'Reacted 🤘 Rock to Matina Town Square Live\'s jam session post',
      timeAgo: '5h ago',
    },
    {
      id: 'act-5',
      type: 'follow_band',
      title: 'Followed Durian Brass Band',
      timeAgo: 'Yesterday',
      bandName: 'Durian Brass Band',
      bandId: 'artist-06',
    },
  ]);

  // 6. Feeds & Activity Sub-tabs state
  const [activeTab, setActiveTab] = useState<'my_posts' | 'tagged_in' | 'activity'>('my_posts');

  // Filter user posts
  const userPosts = useMemo(() => {
    return feedPosts.filter((p) => p.authorRole === 'fan' || p.authorName.toLowerCase().includes('kiko') || p.authorName.toLowerCase().includes('fan'));
  }, [feedPosts]);

  // Filter posts where user is tagged
  const taggedPosts = useMemo(() => {
    return feedPosts.filter((p) => {
      const content = p.content.toLowerCase();
      return content.includes('@fan') || content.includes('@kiko') || content.includes('front row') || content.includes('regulars');
    });
  }, [feedPosts]);

  // 7. Followers & Following Interactive Modals State
  const [statsModalType, setStatsModalType] = useState<'followers' | 'following' | 'playlists' | null>(null);
  const [viewingUserProfile, setViewingUserProfile] = useState<CommunityUser | null>(null);

  // Followers dataset (1.2K)
  const [followersList, setFollowersList] = useState<CommunityUser[]>([
    {
      id: 'user-bea',
      name: 'Bea Salcedo',
      handle: '@bea_davaorocks',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Matina, Davao City',
      bio: 'MTS Taboan front-row regular. Singing along to every BisRock riff and supporting local indie.',
      isFollowing: true,
      gigsAttended: 42,
    },
    {
      id: 'user-rico',
      name: 'Rico Tan',
      handle: '@rico_bajada',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Bajada, Davao City',
      bio: 'Bass guitar player and indie cassette collector. Catch me at Suazo Bar on acoustic nights.',
      isFollowing: false,
      gigsAttended: 27,
    },
    {
      id: 'user-chloe',
      name: 'Chloe Encarnacion',
      handle: '@chloe_live',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Lanang, Davao City',
      bio: 'Live gig photographer & vinyl lover. Capturing the sweat and heart of Davao music stages.',
      isFollowing: true,
      gigsAttended: 35,
    },
    {
      id: 'user-anton',
      name: 'Anton Solis',
      handle: '@antonsolis_marfori',
      avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Marfori Heights',
      bio: 'Lead vocals & rhythm guitar @The Marfori Sound. Blending kulintang with Fender overdrive.',
      isFollowing: true,
      bandId: 'artist-01',
    },
    {
      id: 'user-jigs',
      name: 'Jigs Magbanua',
      handle: '@jigs_bass',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Matina',
      bio: 'Precision bass & low-end groove maker for local Davao sound stages.',
      isFollowing: true,
      bandId: 'artist-01',
    },
    {
      id: 'user-dave',
      name: 'Dave "Kudlit" Perez',
      handle: '@dave_kudlit',
      avatar: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Buhangin',
      bio: 'Lead guitar of Caliber 45. 30 years of keeping Davao BisRock loud and proud.',
      isFollowing: true,
      bandId: 'caliber-45',
    },
    {
      id: 'user-mara',
      name: 'Mara Santos',
      handle: '@mara_samal',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Samal Waters & Davao Gulf',
      bio: 'Island reggae and sunset acoustic lover. Supporting Mindanao artists everywhere.',
      isFollowing: false,
      gigsAttended: 19,
    },
  ]);

  // Following dataset (248)
  const [followingList, setFollowingList] = useState<CommunityUser[]>([
    {
      id: 'band-marfori',
      name: 'The Marfori Sound',
      handle: '@themarforisound',
      avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Marfori Heights / Bajada',
      bio: '4-piece indie & tribal groove outfit. Kulintang rhythms with lush dream-pop guitars.',
      isFollowing: true,
      bandId: 'artist-01',
    },
    {
      id: 'band-c45',
      name: 'Caliber 45',
      handle: '@caliber45_davao',
      avatar: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Matina & Buhangin',
      bio: 'The legendary Davao BisRock band behind Pamalandong and Buhay Musikero.',
      isFollowing: true,
      bandId: 'caliber-45',
    },
    {
      id: 'band-kalinaw',
      name: 'Kalinaw Tribe',
      handle: '@kalinaw_tribe',
      avatar: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Marfori & Bankerohan',
      bio: 'Island Reggae / Kulintang Dub ensemble bringing calm vibes across the Gulf.',
      isFollowing: true,
      bandId: 'artist-03',
    },
    {
      id: 'band-anne',
      name: 'Anne Mendoza',
      handle: '@annemendoza',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Toril, Davao City',
      bio: 'Mindanao Indie / Soul vocalist and acoustic songsmith.',
      isFollowing: true,
      bandId: 'artist-02',
    },
    {
      id: 'band-durian',
      name: 'Durian Brass Band',
      handle: '@durian_brass',
      avatar: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Poblacion, Davao City',
      bio: '8-piece brass ensemble blending funky horn licks with Kadayawan percussive rhythms.',
      isFollowing: true,
      bandId: 'artist-06',
    },
    {
      id: 'band-apohc',
      name: 'Apo Hardcore',
      handle: '@apohc_dvo',
      avatar: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=300&auto=format&fit=crop&q=80',
      role: 'artist',
      district: 'Claveria / Poblacion',
      bio: 'Heavy riffs and ferocious vocals built for intense live mosh pits.',
      isFollowing: true,
      bandId: 'artist-04',
    },
    {
      id: 'user-bea-fol',
      name: 'Bea Salcedo',
      handle: '@bea_davaorocks',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Matina, Davao City',
      bio: 'MTS Taboan front-row regular & gig lover.',
      isFollowing: true,
    },
    {
      id: 'user-chloe-fol',
      name: 'Chloe Encarnacion',
      handle: '@chloe_live',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
      role: 'fan',
      district: 'Lanang, Davao City',
      bio: 'Davao gig photographer & vinyl collector.',
      isFollowing: true,
    },
  ]);

  // Toggle follow/unfollow in modal
  const handleToggleFollowUser = (userId: string, isCurrentlyFollowing: boolean) => {
    setFollowersList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isFollowing: !isCurrentlyFollowing } : u))
    );
    setFollowingList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isFollowing: !isCurrentlyFollowing } : u))
    );
  };

  // Audio playback toggle for playlist tracks
  const handleTogglePlayTrack = (track: Track) => {
    if (playingTrackId === track.id) {
      audioEngine.pause();
      setPlayingTrackId(null);
    } else {
      audioEngine.playTrack(track.synthPreset);
      setPlayingTrackId(track.id);

      // Record activity
      setActivityLog((prev) => [
        {
          id: `act-${Date.now()}`,
          type: 'like_song',
          title: `Streamed "${track.title}" by ${track.artist}`,
          timeAgo: 'Just now',
          bandName: track.artist,
          bandId: track.artistId,
        },
        ...prev,
      ]);
    }
  };

  // Create playlist submission handler
  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: newPlaylistName.trim(),
      description: newPlaylistDesc.trim() || 'Selected Davao homegrown band tracks.',
      coverImage: selectedTrackIds.length > 0
        ? allBandTracks.find((t) => t.id === selectedTrackIds[0])?.albumArt
        : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      trackIds: selectedTrackIds,
      createdAt: 'Just now',
      createdBy: profile.name,
    };

    setPlaylists((prev) => [newPl, ...prev]);
    setExpandedPlaylistId(newPl.id);

    // Record activity
    setActivityLog((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'playlist_create',
        title: `Created new playlist "${newPl.name}" with ${selectedTrackIds.length} band songs`,
        timeAgo: 'Just now',
      },
      ...prev,
    ]);

    // Reset modal
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setSelectedTrackIds([]);
    setIsCreateModalOpen(false);
  };

  // Toggle track selection in Create Playlist modal
  const handleToggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  };

  // Remove track from playlist
  const handleRemoveTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return {
            ...pl,
            trackIds: pl.trackIds.filter((id) => id !== trackId),
          };
        }
        return pl;
      })
    );
  };

  // Handler for clicking a user in Followers or Following list
  const handleUserClick = (user: CommunityUser) => {
    setStatsModalType(null); // Close the modal
    if (user.bandId) {
      onSelectArtist(user.bandId);
    } else {
      setViewingUserProfile(user);
    }
  };

  // Handler to save profile edits
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...profile,
      name: editName.trim() || profile.name,
      handle: editHandle.trim().startsWith('@') ? editHandle.trim() : `@${editHandle.trim()}`,
      district: editDistrict.trim() || profile.district,
      bio: editBio.trim() || profile.bio,
      avatar: editAvatar.trim() || profile.avatar,
      coverImage: editCoverImage.trim() || profile.coverImage,
    };
    setProfile(updated);
    onUpdateFanProfile?.(updated);
    setIsEditModalOpen(false);

    // Record activity log entry
    setActivityLog((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'profile_edit',
        title: 'Updated fan profile information & scene photos',
        timeAgo: 'Just now',
      },
      ...prev,
    ]);
  };

  // =========================================================================
  // VISITING ANOTHER FAN'S PROFILE (When clicking on a follower / following)
  // =========================================================================
  if (viewingUserProfile) {
    return (
      <div className="min-h-screen text-[#EBEBED] pb-32 pt-2 px-3 sm:px-6 max-w-2xl mx-auto space-y-5 animate-fadeIn">
        {/* Top Back Navigation Bar */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => setViewingUserProfile(null)}
            id="back-to-my-profile-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#53E6D4]" />
            <span>Back to My Profile</span>
          </button>

          <span className="text-[10px] font-mono text-[#53E6D4] px-2.5 py-0.5 rounded-full bg-[#53E6D4]/10 border border-[#53E6D4]/20">
            Davao Scene Fan Profile
          </span>
        </div>

        {/* Hero Card */}
        <div className="relative rounded-3xl overflow-hidden bg-[#161B20] border border-white/10 shadow-2xl space-y-4">
          <div className="relative h-36 sm:h-44 w-full bg-gradient-to-r from-[#6045F4] via-[#3B299E] to-[#12161A] overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80"
              alt="Live stage"
              className="w-full h-full object-cover opacity-45 mix-blend-overlay filter blur-[0.5px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-transparent to-black/30" />
          </div>

          <div className="px-4 sm:px-6 pb-6 pt-0 relative">
            <div className="flex items-center justify-between gap-3 -mt-16 sm:-mt-14 mb-3">
              <div className="relative">
                <img
                  src={viewingUserProfile.avatar}
                  alt={viewingUserProfile.name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl object-cover border-4 border-[#161B20] shadow-2xl bg-[#0F1417] aspect-square"
                />
              </div>

              {/* Prominent Follow / Following Button */}
              <button
                type="button"
                onClick={() => {
                  handleToggleFollowUser(viewingUserProfile.id, !!viewingUserProfile.isFollowing);
                  setViewingUserProfile((prev) => prev ? { ...prev, isFollowing: !prev.isFollowing } : null);
                }}
                id="viewing-user-follow-btn"
                className={`px-4 py-2 rounded-xl text-xs font-heading font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md ${
                  viewingUserProfile.isFollowing
                    ? 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/20'
                    : 'bg-[#53E6D4] text-[#0F1417] hover:bg-[#6efae9] shadow-[0_0_12px_rgba(83,230,212,0.4)]'
                }`}
              >
                {viewingUserProfile.isFollowing ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#53E6D4]" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            </div>

            {/* Profile Info */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-white">
                  {viewingUserProfile.name}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-medium font-mono">
                  {viewingUserProfile.handle}
                </span>
              </div>

              <p className="text-xs text-[#8E9AA7] font-mono flex items-center gap-2">
                <span className="flex items-center gap-1 text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-[#53E6D4]" />
                  {viewingUserProfile.district}
                </span>
              </p>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1 max-w-xl">
                {viewingUserProfile.bio}
              </p>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-2 pt-4 mt-4 border-t border-white/5 text-center">
              <div className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5">
                <span className="text-lg sm:text-xl font-heading font-extrabold text-[#53E6D4] block">
                  892
                </span>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
                  Followers
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5">
                <span className="text-lg sm:text-xl font-heading font-extrabold text-[#A78BFA] block">
                  145
                </span>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
                  Following
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5">
                <span className="text-lg sm:text-xl font-heading font-extrabold text-white block">
                  {viewingUserProfile.gigsAttended || 28}
                </span>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">
                  Gigs Attended
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bands Followed By This User */}
        <section className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-3.5 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#6045F4] flex items-center justify-center text-white shadow-sm">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-heading font-extrabold text-white">
                Bands {viewingUserProfile.name.split(' ')[0]} Follows
              </h3>
              <p className="text-[10px] text-[#8E9AA7] font-mono">
                Davao bands in heavy rotation
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 pt-1">
            {followedBandsList.slice(0, 5).map((band) => (
              <div
                key={band.id}
                onClick={() => onSelectArtist(band.id)}
                className="group flex flex-col items-center text-center cursor-pointer space-y-1.5"
                title={`View ${band.name} Profile`}
              >
                <img
                  src={band.avatar}
                  alt={band.name}
                  className="w-13 h-13 rounded-2xl object-cover border-2 border-white/10 group-hover:border-[#53E6D4] group-hover:scale-105 transition-all shadow-md aspect-square"
                />
                <span className="text-[11px] font-heading font-bold text-white group-hover:text-[#53E6D4] transition-colors truncate w-full block">
                  {band.name}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Curated Playlists by this user */}
        <section className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-3.5 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#53E6D4] flex items-center justify-center text-[#0F1417] shadow-sm">
              <ListMusic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-heading font-extrabold text-white">
                {viewingUserProfile.name.split(' ')[0]}'s Playlists
              </h3>
              <p className="text-[10px] text-[#8E9AA7] font-mono">
                Curated Davao music playlists
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {playlists.slice(0, 2).map((pl) => (
              <div
                key={pl.id}
                className="p-3 rounded-2xl bg-[#0F1417] border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={pl.coverImage}
                    alt={pl.name}
                    className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0 aspect-square"
                  />
                  <div className="min-w-0">
                    <span className="font-heading font-bold text-xs sm:text-sm text-white block truncate">
                      {pl.name}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {pl.description}
                    </span>
                    <span className="text-[9px] text-[#53E6D4] font-mono block">
                      {pl.trackIds.length} tracks
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const firstTrack = allBandTracks.find((t) => pl.trackIds.includes(t.id));
                    if (firstTrack) handleTogglePlayTrack(firstTrack);
                  }}
                  className="p-2 rounded-xl bg-[#6045F4] hover:bg-[#745BFF] text-white cursor-pointer active:scale-95 transition-all"
                  title="Play preview"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* User's Scene Feed Posts */}
        <section className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-3.5 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center text-white shadow-sm">
              <MessageCircle className="w-3.5 h-3.5 text-[#53E6D4]" />
            </div>
            <div>
              <h3 className="text-sm font-heading font-extrabold text-white">
                Recent Posts from {viewingUserProfile.name}
              </h3>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0F1417] border border-white/10 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <img
                src={viewingUserProfile.avatar}
                alt={viewingUserProfile.name}
                className="w-7 h-7 rounded-full object-cover"
              />
              <div>
                <span className="font-heading font-bold text-white block">
                  {viewingUserProfile.name}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  Yesterday at MTS Taboan
                </span>
              </div>
            </div>
            <p className="text-slate-200 leading-relaxed">
              Incredible live set tonight! Nothing beats cold beer and live Mindanao BisRock. Shoutout to all the Davao bands keeping our scene alive! 🎸🔥
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#EBEBED] pb-32 pt-2 px-3 sm:px-6 max-w-2xl mx-auto space-y-5">
      
      {/* ===================================================================== */}
      {/* 1. TOP NAVIGATION ROW                                                 */}
      {/* ===================================================================== */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          onClick={() => onNavigateToScreen('connect')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Feed</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#53E6D4] px-2 py-0.5 rounded-full bg-[#53E6D4]/10 border border-[#53E6D4]/20">
            Davao Fan Profile
          </span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. MAIN PROFILE HEADER CARD                                           */}
      {/* (MTS scene member label & Go to Davao feed button removed as requested) */}
      {/* ===================================================================== */}
      <div className="relative rounded-3xl overflow-hidden bg-[#161B20] border border-white/10 shadow-2xl space-y-4">
        
        {/* Cover Photo */}
        <div className="relative h-36 sm:h-44 w-full bg-gradient-to-r from-[#6045F4] via-[#3B299E] to-[#12161A] overflow-hidden">
          <img
            src={profile.coverImage || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&auto=format&fit=crop&q=80"}
            alt="Concert Crowd"
            className="w-full h-full object-cover opacity-45 mix-blend-overlay filter blur-[0.5px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#161B20] via-transparent to-black/30" />
        </div>

        {/* Profile Details Bar */}
        <div className="px-4 sm:px-6 pb-6 pt-0 relative">
          
          {/* Avatar floating over cover with Edit Profile Button */}
          <div className="flex items-center justify-between gap-3 -mt-16 sm:-mt-14 mb-3">
            <div className="relative">
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl object-cover border-4 border-[#161B20] shadow-2xl bg-[#0F1417] aspect-square"
              />
            </div>

            {/* Edit Profile Button (Verified Fan label removed) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditName(profile.name);
                  setEditHandle(profile.handle);
                  setEditDistrict(profile.district);
                  setEditBio(profile.bio);
                  setEditAvatar(profile.avatar);
                  setEditCoverImage(profile.coverImage || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&auto=format&fit=crop&q=80');
                  setIsEditModalOpen(true);
                }}
                id="edit-fan-profile-btn"
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-heading font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#53E6D4]" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* User Name & Handle */}
          <div className="space-y-1.5 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-white">
                {profile.name}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-medium font-mono">
                {profile.handle}
              </span>
            </div>

            <p className="text-xs text-[#8E9AA7] font-mono flex items-center gap-2">
              <span className="flex items-center gap-1 text-slate-300">
                <MapPin className="w-3 h-3 text-[#53E6D4]" />
                {profile.district}
              </span>
            </p>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1 max-w-xl">
              {profile.bio}
            </p>
          </div>

          {/* ================================================================= */}
          {/* STATS BAR: Clickable Followers, Following & Playlists Cards        */}
          {/* ================================================================= */}
          <div className="grid grid-cols-3 gap-2 pt-4 mt-4 border-t border-white/5 text-center">
            
            {/* Clickable Followers Card */}
            <div 
              onClick={() => setStatsModalType('followers')}
              id="fan-stat-followers-card"
              className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5 hover:border-[#53E6D4]/60 hover:bg-[#161B20] transition-all cursor-pointer group shadow-sm active:scale-95"
              title="Click to view followers"
            >
              <span className="text-lg sm:text-xl font-heading font-extrabold text-[#53E6D4] group-hover:scale-105 transition-transform block">
                1.2K
              </span>
              <span className="text-[10px] text-slate-400 group-hover:text-white font-mono uppercase tracking-wider block">
                Followers
              </span>
              <span className="text-[9px] text-[#53E6D4] opacity-0 group-hover:opacity-100 transition-opacity font-mono block">
                View list →
              </span>
            </div>

            {/* Clickable Following Card */}
            <div 
              onClick={() => setStatsModalType('following')}
              id="fan-stat-following-card"
              className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5 hover:border-[#A78BFA]/60 hover:bg-[#161B20] transition-all cursor-pointer group shadow-sm active:scale-95"
              title="Click to view following"
            >
              <span className="text-lg sm:text-xl font-heading font-extrabold text-[#A78BFA] group-hover:scale-105 transition-transform block">
                248
              </span>
              <span className="text-[10px] text-slate-400 group-hover:text-white font-mono uppercase tracking-wider block">
                Following
              </span>
              <span className="text-[9px] text-[#A78BFA] opacity-0 group-hover:opacity-100 transition-opacity font-mono block">
                View list →
              </span>
            </div>

            {/* Clickable Playlists Card */}
            <div 
              onClick={() => setStatsModalType('playlists')}
              id="fan-stat-playlists-card"
              className="p-2.5 rounded-2xl bg-[#0F1417] border border-white/5 hover:border-white/40 hover:bg-[#161B20] transition-all cursor-pointer group shadow-sm active:scale-95"
              title="Click to view playlists"
            >
              <span className="text-lg sm:text-xl font-heading font-extrabold text-white group-hover:scale-105 transition-transform block">
                {playlists.length}
              </span>
              <span className="text-[10px] text-slate-400 group-hover:text-white font-mono uppercase tracking-wider block">
                Playlists
              </span>
              <span className="text-[9px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity font-mono block">
                View list →
              </span>
            </div>

          </div>

        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. BANDS FOLLOWED LANE (With SQUARE profile icons & Show All button)    */}
      {/* ===================================================================== */}
      <section className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-3.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#6045F4] flex items-center justify-center text-white shadow-sm">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-heading font-extrabold text-white">
                Bands Followed
              </h3>
              <p className="text-[10px] text-[#8E9AA7] font-mono">
                {followedBandsList.length} Davao Bands in rotation
              </p>
            </div>
          </div>

          {/* Show All / Show Less Button */}
          <button
            type="button"
            onClick={() => setShowAllBands((prev) => !prev)}
            id="show-all-bands-btn"
            className="text-xs font-semibold text-[#53E6D4] hover:text-white flex items-center gap-1 cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            <span>{showAllBands ? 'Show Less' : `Show All (${followedBandsList.length})`}</span>
            {showAllBands ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Bands icons row with SQUARE rather than circle profile icons */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 pt-1">
          {displayedBands.map((band) => (
            <div
              key={band.id}
              onClick={() => onSelectArtist(band.id)}
              className="group flex flex-col items-center text-center cursor-pointer space-y-1.5"
              title={`View ${band.name} Profile`}
            >
              {/* Square Image Icon */}
              <div className="relative">
                <img
                  src={band.avatar}
                  alt={band.name}
                  className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-white/10 group-hover:border-[#53E6D4] group-hover:scale-105 transition-all shadow-md aspect-square"
                />
                {band.verified && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-md bg-[#53E6D4] text-[#0F1417] flex items-center justify-center ring-2 ring-[#161B20]">
                    <ShieldCheck className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              {/* Partial / Truncated Band Name */}
              <span className="text-[11px] font-heading font-bold text-white group-hover:text-[#53E6D4] transition-colors truncate w-full block">
                {band.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 4. FAN PLAYLISTS SECTION (Curated from artists' uploaded music)        */}
      {/* ===================================================================== */}
      <section 
        id="fan-playlists-section"
        className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-4 shadow-lg"
      >
        {/* Header - Single lane with smaller New Playlist button */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3 flex-nowrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-[#53E6D4] flex items-center justify-center text-[#0F1417] shadow-sm flex-shrink-0">
              <ListMusic className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-heading font-extrabold text-white truncate">
                Fan Playlists
              </h3>
              <p className="text-[10px] text-[#8E9AA7] font-mono truncate hidden xs:block">
                Curated from uploaded music by local Davao artists
              </p>
            </div>
          </div>

          {/* Smaller 'New Playlist' button in one lane */}
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            id="create-playlist-btn"
            className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#6045F4] hover:bg-[#745BFF] text-white text-[11px] sm:text-xs font-heading font-bold flex items-center gap-1 shadow-sm cursor-pointer active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="whitespace-nowrap">New Playlist</span>
          </button>
        </div>

        {/* Playlists List */}
        <div className="space-y-3">
          {playlists.map((playlist) => {
            const isExpanded = expandedPlaylistId === playlist.id;
            const playlistTracks = allBandTracks.filter((t) => playlist.trackIds.includes(t.id));

            return (
              <div
                key={playlist.id}
                className="rounded-2xl bg-[#0F1417] border border-white/10 overflow-hidden transition-all space-y-3 p-3 sm:p-4"
              >
                {/* Playlist Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div 
                    onClick={() => setExpandedPlaylistId(isExpanded ? null : playlist.id)}
                    className="flex items-center gap-3 min-w-0 cursor-pointer group flex-1"
                  >
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-black flex-shrink-0 border border-white/15 aspect-square">
                      <img
                        src={playlist.coverImage || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80'}
                        alt={playlist.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-4 h-4 text-[#53E6D4] fill-current" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="font-heading font-extrabold text-sm sm:text-base text-white group-hover:text-[#53E6D4] transition-colors truncate">
                        {playlist.name}
                      </h4>
                      <p className="text-[11px] text-[#8E9AA7] truncate">
                        {playlist.description}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                        <span className="text-[#53E6D4]">{playlistTracks.length} tracks</span>
                        <span>•</span>
                        <span>Created by {playlist.createdBy}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expand / Collapse Button */}
                  <button
                    type="button"
                    onClick={() => setExpandedPlaylistId(isExpanded ? null : playlist.id)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expanded Playlist Tracklist */}
                {isExpanded && (
                  <div className="pt-2 border-t border-white/10 space-y-2 animate-fadeIn">
                    {playlistTracks.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        No tracks in this playlist yet. Add songs from band uploads!
                      </p>
                    ) : (
                      playlistTracks.map((track, idx) => {
                        const isCurrentPlaying = playingTrackId === track.id;
                        return (
                          <div
                            key={track.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[10px] text-slate-500 font-mono w-4 text-center">
                                {idx + 1}
                              </span>

                              {/* Play / Pause track */}
                              <button
                                type="button"
                                onClick={() => handleTogglePlayTrack(track)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                                  isCurrentPlaying
                                    ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_8px_rgba(83,230,212,0.5)]'
                                    : 'bg-[#6045F4] text-white hover:bg-[#745BFF]'
                                }`}
                                title={isCurrentPlaying ? 'Pause track' : 'Play track'}
                              >
                                {isCurrentPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                                )}
                              </button>

                              <div className="truncate">
                                <span className="text-white font-bold block truncate">
                                  {track.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onSelectArtist(track.artistId)}
                                  className="text-[10px] text-[#53E6D4] hover:underline block truncate text-left cursor-pointer"
                                >
                                  {track.artist}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {track.duration}
                              </span>

                              {/* Remove from playlist */}
                              <button
                                type="button"
                                onClick={() => handleRemoveTrackFromPlaylist(playlist.id, track.id)}
                                className="p-1 text-slate-500 hover:text-red-400 cursor-pointer transition-colors"
                                title="Remove from playlist"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 5. USER FEED, TAGGED FEED, & ACTIVITY LOG TABS                        */}
      {/* ===================================================================== */}
      <section className="rounded-2xl sm:rounded-3xl bg-[#161B20] border border-white/10 p-4 sm:p-5 space-y-4 shadow-lg">
        
        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#0F1417] p-1 rounded-2xl border border-white/10 text-xs font-heading font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('my_posts')}
            className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 text-center truncate ${
              activeTab === 'my_posts'
                ? 'bg-[#53E6D4] text-[#0F1417] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>My Posts</span>
            <span className="text-[9px] opacity-75 font-mono">({userPosts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tagged_in')}
            className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 text-center truncate ${
              activeTab === 'tagged_in'
                ? 'bg-[#6045F4] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Tagged In</span>
            <span className="text-[9px] opacity-75 font-mono">({taggedPosts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`py-2 px-1 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 text-center truncate ${
              activeTab === 'activity'
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Activity Log</span>
          </button>
        </div>

        {/* Tab 1: Latest Feed Posted by User */}
        {activeTab === 'my_posts' && (
          <div className="space-y-3">
            {userPosts.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                You haven't posted in the Davao sound feed yet.
              </div>
            ) : (
              userPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-[#0F1417] border border-white/10 space-y-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="w-8 h-8 rounded-full object-cover border border-white/15"
                    />
                    <div>
                      <span className="font-heading font-bold text-white block">
                        {post.authorName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {post.timeAgo} • {post.districtTag}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-200 leading-relaxed text-xs sm:text-sm">
                    {post.content}
                  </p>

                  {post.image && (
                    <div className="rounded-xl overflow-hidden bg-black max-h-60">
                      <img
                        src={post.image}
                        alt="Post media"
                        className="w-full h-44 sm:h-52 object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[#53E6D4]">
                        <Flame className="w-3.5 h-3.5" />
                        {post.reactions.rock + post.reactions.fire + post.reactions.orchid} reactions
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {post.commentCount} comments
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Feed that the User is Tagged In */}
        {activeTab === 'tagged_in' && (
          <div className="space-y-3">
            {taggedPosts.map((post) => (
              <div
                key={post.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-[#0F1417] border border-[#6045F4]/30 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="w-8 h-8 rounded-full object-cover border border-white/15"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-heading font-bold text-white block">
                          {post.authorName}
                        </span>
                        {post.verified && (
                          <ShieldCheck className="w-3 h-3 text-[#53E6D4]" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {post.timeAgo}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#A78BFA] text-[10px] font-mono">
                    Tagged Fan
                  </span>
                </div>

                <p className="text-slate-200 leading-relaxed text-xs sm:text-sm">
                  {post.content}
                </p>

                {post.image && (
                  <div className="rounded-xl overflow-hidden bg-black max-h-60">
                    <img
                      src={post.image}
                      alt="Post media"
                      className="w-full h-44 sm:h-52 object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-slate-400">
                  <span className="text-[#53E6D4]">
                    {post.reactions.rock + post.reactions.fire} community likes
                  </span>
                  <span>{post.commentCount} comments</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Users Activity Log */}
        {activeTab === 'activity' && (
          <div className="space-y-2.5">
            {activityLog.map((act) => (
              <div
                key={act.id}
                className="p-3 rounded-xl bg-[#0F1417] border border-white/5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-[#6045F4]/20 flex items-center justify-center text-[#53E6D4] flex-shrink-0">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div className="truncate">
                    <span className="text-white block font-medium truncate">
                      {act.title}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {act.timeAgo}
                    </span>
                  </div>
                </div>

                {act.bandId && (
                  <button
                    type="button"
                    onClick={() => onSelectArtist(act.bandId!)}
                    className="text-[10px] text-[#53E6D4] hover:underline font-mono flex-shrink-0 cursor-pointer"
                  >
                    View Band
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </section>

      {/* ===================================================================== */}
      {/* 6. CREATE PLAYLIST MODAL                                              */}
      {/* ===================================================================== */}
      {isCreateModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg rounded-3xl bg-[#161B20] border border-white/15 p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#6045F4] flex items-center justify-center text-white">
                  <ListMusic className="w-4 h-4" />
                </div>
                <h3 className="text-base font-heading font-extrabold text-white">
                  Create New Davao Playlist
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreatePlaylistSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Playlist Name *
                </label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. MTS Saturday Night Sessions"
                  required
                  className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Description
                </label>
                <input
                  type="text"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  placeholder="e.g. My favorite homegrown tracks from Davao scene"
                  className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6045F4]"
                />
              </div>

              {/* Track Selector from Artists' Uploaded Music */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">
                    Select Tracks from Davao Bands ({selectedTrackIds.length} selected)
                  </span>
                  <span className="text-[10px] text-[#53E6D4] font-mono">
                    All Band Uploads
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 bg-[#0F1417] rounded-xl border border-white/10">
                  {allBandTracks.map((track) => {
                    const isSelected = selectedTrackIds.includes(track.id);
                    return (
                      <div
                        key={track.id}
                        onClick={() => handleToggleTrackSelection(track.id)}
                        className={`flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isSelected
                            ? 'bg-[#6045F4]/30 border border-[#6045F4]/60 text-white'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isSelected ? 'bg-[#53E6D4] border-[#53E6D4] text-[#0F1417]' : 'border-slate-500'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="truncate">
                            <span className="font-bold block truncate text-xs text-white">
                              {track.title}
                            </span>
                            <span className="text-[10px] text-[#53E6D4] block truncate">
                              {track.artist} • {track.genre.split('/')[0]}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                          {track.duration}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  id="save-playlist-submit-btn"
                  className="px-5 py-2 rounded-xl bg-[#53E6D4] hover:bg-[#6efae9] text-[#0F1417] text-xs font-heading font-extrabold cursor-pointer active:scale-95 shadow-md shadow-[#53E6D4]/30 transition-all"
                >
                  Save Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. STATS MODAL: FOLLOWERS, FOLLOWING, & PLAYLISTS (Interactive list)  */}
      {/* ===================================================================== */}
      {statsModalType !== null && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setStatsModalType(null)}
        >
          <div 
            className="w-full max-w-lg rounded-3xl bg-[#161B20] border border-white/15 p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header & Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0F1417] border border-white/10">
                <button
                  type="button"
                  onClick={() => setStatsModalType('followers')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all cursor-pointer ${
                    statsModalType === 'followers'
                      ? 'bg-[#53E6D4] text-[#0F1417]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Followers (1.2K)
                </button>
                <button
                  type="button"
                  onClick={() => setStatsModalType('following')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all cursor-pointer ${
                    statsModalType === 'following'
                      ? 'bg-[#A78BFA] text-[#0F1417]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Following (248)
                </button>
                <button
                  type="button"
                  onClick={() => setStatsModalType('playlists')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all cursor-pointer ${
                    statsModalType === 'playlists'
                      ? 'bg-white text-[#0F1417]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Playlists ({playlists.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStatsModalType(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content: Followers List */}
            {statsModalType === 'followers' && (
              <div className="space-y-2">
                <p className="text-[11px] text-[#8E9AA7] font-mono px-1">
                  Fellow Davao music community members and musicians following {profile.name}:
                </p>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {followersList.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleUserClick(user)}
                      className="p-2.5 rounded-2xl bg-[#0F1417] hover:bg-[#1C2228] border border-white/5 hover:border-[#53E6D4]/40 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Square / Rounded Avatar */}
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-12 h-12 rounded-xl object-cover border border-white/10 group-hover:border-[#53E6D4] transition-colors aspect-square"
                          />
                          {user.role === 'artist' && (
                            <span className="absolute -bottom-1 -right-1 p-0.5 bg-[#6045F4] text-white rounded-md text-[8px] font-bold">
                              Band
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-xs sm:text-sm text-white group-hover:text-[#53E6D4] transition-colors truncate">
                              {user.name}
                            </span>
                            {user.role === 'artist' && (
                              <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4]" />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block truncate">
                            {user.handle} • {user.district.split(',')[0]}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {user.bio}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFollowUser(user.id, !!user.isFollowing);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                            user.isFollowing
                              ? 'bg-white/10 text-slate-300 hover:bg-white/20'
                              : 'bg-[#53E6D4] text-[#0F1417] hover:bg-[#6efae9]'
                          }`}
                        >
                          {user.isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content: Following List */}
            {statsModalType === 'following' && (
              <div className="space-y-2">
                <p className="text-[11px] text-[#8E9AA7] font-mono px-1">
                  Bands, artists, and music creators {profile.name} is following:
                </p>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {followingList.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleUserClick(user)}
                      className="p-2.5 rounded-2xl bg-[#0F1417] hover:bg-[#1C2228] border border-white/5 hover:border-[#A78BFA]/50 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Square / Rounded Avatar */}
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-12 h-12 rounded-xl object-cover border border-white/10 group-hover:border-[#A78BFA] transition-colors aspect-square"
                          />
                          {user.role === 'artist' && (
                            <span className="absolute -bottom-1 -right-1 p-0.5 bg-[#6045F4] text-white rounded-md text-[8px] font-bold">
                              Band
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-xs sm:text-sm text-white group-hover:text-[#A78BFA] transition-colors truncate">
                              {user.name}
                            </span>
                            {user.role === 'artist' && (
                              <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4]" />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block truncate">
                            {user.handle} • {user.district.split(',')[0]}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {user.bio}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono">
                          {user.bandId ? 'Visit Band' : 'View Profile'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Content: Playlists List */}
            {statsModalType === 'playlists' && (
              <div className="space-y-2">
                <p className="text-[11px] text-[#8E9AA7] font-mono px-1">
                  Playlists created by {profile.name}:
                </p>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setExpandedPlaylistId(pl.id);
                        setStatsModalType(null);
                        // Scroll down to playlists section smoothly
                        document.getElementById('fan-playlists-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="p-3 rounded-2xl bg-[#0F1417] hover:bg-[#1C2228] border border-white/5 hover:border-white/30 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={pl.coverImage || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80'}
                          alt={pl.name}
                          className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0 aspect-square"
                        />
                        <div className="min-w-0">
                          <span className="font-heading font-bold text-xs sm:text-sm text-white group-hover:text-[#53E6D4] transition-colors block truncate">
                            {pl.name}
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {pl.description}
                          </span>
                          <span className="text-[9px] text-[#53E6D4] font-mono block">
                            {pl.trackIds.length} tracks • Click to open
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="p-2 rounded-xl bg-[#6045F4] text-white">
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 9. EDIT PROFILE MODAL                                                 */}
      {/* ===================================================================== */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg rounded-3xl bg-[#161B20] border border-white/15 p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#53E6D4] flex items-center justify-center text-[#0F1417] shadow-sm">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-heading font-extrabold text-white">
                    Edit Fan Profile
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Update your scene identity, avatar, and concert cover
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hidden file inputs for avatar & cover photo */}
            <input
              type="file"
              ref={avatarFileInputRef}
              accept="image/*"
              onChange={handleAvatarFileUpload}
              className="hidden"
            />
            <input
              type="file"
              ref={coverFileInputRef}
              accept="image/*"
              onChange={handleCoverFileUpload}
              className="hidden"
            />

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Profile Avatar & Cover preview section */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  Profile Images
                </label>
                
                {/* Live Avatar Preview & Upload */}
                <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/10 space-y-2.5">
                  <span className="text-[11px] text-[#8E9AA7] font-mono block">
                    Profile Picture (Avatar)
                  </span>
                  
                  <div className="flex items-center gap-3">
                    <img
                      src={editAvatar}
                      alt="Avatar Preview"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-[#53E6D4] shadow-md flex-shrink-0 aspect-square"
                    />
                    
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#53E6D4]" />
                        <span>Upload Photo from Device</span>
                      </button>
                      
                      <p className="text-[10px] text-slate-400">
                        Or pick a community avatar preset:
                      </p>
                    </div>
                  </div>

                  {/* Preset Avatars Row */}
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                    {PRESET_AVATARS.map((pa) => (
                      <button
                        key={pa.label}
                        type="button"
                        onClick={() => setEditAvatar(pa.url)}
                        className={`group flex items-center gap-1.5 px-2 py-1 rounded-xl border text-[10px] transition-all cursor-pointer flex-shrink-0 ${
                          editAvatar === pa.url
                            ? 'bg-[#53E6D4]/20 border-[#53E6D4] text-[#53E6D4]'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <img src={pa.url} alt={pa.label} className="w-5 h-5 rounded-lg object-cover aspect-square" />
                        <span>{pa.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual URL Input */}
                  <input
                    type="url"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="Or paste custom image URL..."
                    className="w-full bg-[#161B20] border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                  />
                </div>

                {/* Live Cover Banner Preview & Upload */}
                <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/10 space-y-2.5">
                  <span className="text-[11px] text-[#8E9AA7] font-mono block">
                    Cover Banner Photo
                  </span>

                  <div className="relative h-24 w-full rounded-xl overflow-hidden border border-white/15">
                    <img
                      src={editCoverImage}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => coverFileInputRef.current?.click()}
                        className="px-3.5 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-sm"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#53E6D4]" />
                        <span>Change Cover Photo</span>
                      </button>
                    </div>
                  </div>

                  {/* Preset Covers */}
                  <div className="flex items-center gap-2 overflow-x-auto pt-1">
                    {PRESET_COVERS.map((pc) => (
                      <button
                        key={pc.label}
                        type="button"
                        onClick={() => setEditCoverImage(pc.url)}
                        className={`px-2.5 py-1 rounded-xl border text-[10px] transition-all cursor-pointer flex-shrink-0 whitespace-nowrap ${
                          editCoverImage === pc.url
                            ? 'bg-[#6045F4]/30 border-[#6045F4] text-white font-bold'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        {pc.label}
                      </button>
                    ))}
                  </div>

                  {/* Manual Cover URL Input */}
                  <input
                    type="url"
                    value={editCoverImage}
                    onChange={(e) => setEditCoverImage(e.target.value)}
                    placeholder="Or paste custom cover image URL..."
                    className="w-full bg-[#161B20] border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-[#6045F4]"
                  />
                </div>
              </div>

              {/* Text Inputs: Name & Handle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    placeholder="e.g. Kiko Alvarez"
                    className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Handle *
                  </label>
                  <input
                    type="text"
                    value={editHandle}
                    onChange={(e) => setEditHandle(e.target.value)}
                    required
                    placeholder="e.g. @kiko_davaosound"
                    className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                  />
                </div>
              </div>

              {/* District / Turf */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Davao District / Home Turf
                </label>
                <input
                  type="text"
                  value={editDistrict}
                  onChange={(e) => setEditDistrict(e.target.value)}
                  placeholder="e.g. Matina, Davao City"
                  className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                />
              </div>

              {/* Bio */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Bio / Davao Music Story
                </label>
                <textarea
                  rows={3}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell the Davao music scene about your gigs, favorite bands, and sounds..."
                  className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4] resize-none leading-relaxed"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  id="save-profile-btn"
                  className="px-5 py-2 rounded-xl bg-[#53E6D4] hover:bg-[#6efae9] text-[#0F1417] text-xs font-heading font-extrabold cursor-pointer active:scale-95 shadow-md shadow-[#53E6D4]/30 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
