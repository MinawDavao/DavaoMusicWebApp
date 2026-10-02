import React, { useState, useRef } from 'react';
import { UserProfile, FeedPost, GalleryPhoto, FeedComment } from '../../types';
import { DAVAO_ARTISTS_LIST } from '../../data/mockData';
import { 
  Image as ImageIcon, 
  Tag as TagIcon, 
  Send, 
  MessageCircle, 
  Share2, 
  MoreHorizontal, 
  Globe, 
  X, 
  CheckCircle2, 
  Sparkles,
  MapPin,
  Check,
  ChevronDown,
  User,
  Music,
  Smile,
  Copy,
  LogIn
} from 'lucide-react';

interface FanDashboardProps {
  fanProfile?: UserProfile;
  feedPosts: FeedPost[];
  gallery?: GalleryPhoto[];
  onReactionClick?: (postId: string, reactionKey: 'rock' | 'fire' | 'orchid' | 'durian') => void;
  onAddFeedPost?: (newPost: FeedPost) => void;
  onSelectArtist?: (artistId: string) => void;
  onNavigateToAuth?: () => void;
  isLoggedIn?: boolean;
}

// Preset Davao gig photos to make posting fast and fun
const PRESET_CONCERT_PHOTOS = [
  {
    name: 'MTS Taboan Rehearsal',
    url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=80',
  },
  {
    name: 'Suazo Stage Lights',
    url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop&q=80',
  },
  {
    name: 'BisRock Tube Amps',
    url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&auto=format&fit=crop&q=80',
  },
  {
    name: 'Davao Night Market Crowd',
    url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=900&auto=format&fit=crop&q=80',
  },
  {
    name: 'Island Roots Reggae Stage',
    url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&auto=format&fit=crop&q=80',
  },
];

// Quick tags for popular Davao bands & venues
const POPULAR_TAGS = [
  { label: 'Caliber 45', type: 'band', id: 'caliber-45' },
  { label: 'The Marfori Sound', type: 'band', id: 'artist-01' },
  { label: 'Kalinaw Tribe', type: 'band', id: 'artist-02' },
  { label: 'Torres Midnight Club', type: 'band', id: 'artist-03' },
  { label: 'Apo Groove Machine', type: 'band', id: 'artist-04' },
  { label: 'Buhangin Riot', type: 'band', id: 'artist-07' },
  { label: 'Matina Town Square', type: 'venue' },
  { label: 'Suazo Craft Bar', type: 'venue' },
  { label: 'Torres Street', type: 'venue' },
  { label: 'SM Lanang Sky Garden', type: 'venue' },
];

export const FanDashboard: React.FC<FanDashboardProps> = ({
  feedPosts: initialFeedPosts,
  onReactionClick,
  onAddFeedPost,
  onSelectArtist,
  onNavigateToAuth,
  isLoggedIn = false,
}) => {
  // Local feed posts state so guest visitors can post, like, and comment immediately
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(initialFeedPosts);

  // Create Post Composer States
  const [postContent, setPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [authorType, setAuthorType] = useState<'fan' | 'band'>('fan');
  const [selectedBandName, setSelectedBandName] = useState('Caliber 45');
  const [guestFanName, setGuestFanName] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');

  // Active comments drawers (maps postId -> boolean)
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({
    'feed-c45': true, // open first post's comments by default for lively feel
  });

  // Active comment input text (maps postId -> string)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Lightbox photo preview state
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show quick toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Handle local file upload (images only - no video!)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guard: reject videos if user attempts to upload
    if (file.type.startsWith('video/')) {
      showToast('⚠️ Video uploads are not supported. Please select an image.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('⚠️ Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setSelectedImage(event.target.result);
        setShowImagePicker(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle tag
  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Add custom tag
  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTagInput.trim()) return;
    const cleanTag = customTagInput.trim().replace(/^@/, '');
    if (!selectedTags.includes(cleanTag)) {
      setSelectedTags((prev) => [...prev, cleanTag]);
    }
    setCustomTagInput('');
  };

  // Submit new post (Facebook style)
  const handlePublishPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() && !selectedImage) return;

    let authorName = 'Davao Music Fan';
    let authorHandle = '@davaofan_guest';
    let authorAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80';
    let authorRole: 'fan' | 'artist' = 'fan';
    let verified = false;

    if (authorType === 'band') {
      authorName = selectedBandName;
      authorRole = 'artist';
      verified = true;
      const matchedArtist = DAVAO_ARTISTS_LIST.find((a) => a.name === selectedBandName);
      if (matchedArtist) {
        authorHandle = matchedArtist.handle;
        authorAvatar = matchedArtist.avatar;
      } else {
        authorHandle = `@${selectedBandName.toLowerCase().replace(/\s+/g, '')}`;
        authorAvatar = 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&auto=format&fit=crop&q=80';
      }
    } else if (guestFanName.trim()) {
      authorName = guestFanName.trim();
      authorHandle = `@${guestFanName.toLowerCase().replace(/\s+/g, '')}`;
    }

    const newPost: FeedPost = {
      id: `post-${Date.now()}`,
      authorName,
      authorHandle,
      authorAvatar,
      authorRole,
      verified,
      timeAgo: 'Just now',
      content: postContent.trim(),
      taggedBands: selectedTags,
      venueTag: selectedTags.find((t) => t.includes('Square') || t.includes('Bar') || t.includes('Street') || t.includes('Garden')),
      districtTag: 'Davao City',
      image: selectedImage || undefined,
      reactions: { rock: 1, fire: 0, orchid: 0, durian: 0 },
      userReactions: ['rock'],
      commentCount: 0,
      shares: 0,
      comments: [],
    };

    // Update state
    setFeedPosts((prev) => [newPost, ...prev]);
    onAddFeedPost?.(newPost);

    // Reset composer
    setPostContent('');
    setSelectedImage(null);
    setSelectedTags([]);
    setShowTagPicker(false);
    setShowImagePicker(false);
    setShowAuthorPicker(false);
    showToast('Post shared to Davao Music Feed!');
  };

  // Toggle post reaction (Facebook style)
  const handleToggleLike = (postId: string, reactionKey: 'rock' | 'fire' | 'orchid' | 'durian' = 'rock') => {
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

    onReactionClick?.(postId, reactionKey);
  };

  // Toggle comments drawer
  const handleToggleComments = (postId: string) => {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  // Add comment to a post
  const handleAddComment = (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;

    const newComment: FeedComment = {
      id: `comm-${Date.now()}`,
      authorName: authorType === 'band' ? selectedBandName : (guestFanName.trim() || 'Davao Music Fan'),
      authorAvatar: authorType === 'band'
        ? (DAVAO_ARTISTS_LIST.find((a) => a.name === selectedBandName)?.avatar || 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&auto=format&fit=crop&q=80')
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      authorRole: authorType === 'band' ? 'artist' : 'fan',
      timeAgo: 'Just now',
      content: text,
      likes: 1,
    };

    setFeedPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const currentComments = p.comments || [];
          return {
            ...p,
            commentCount: p.commentCount + 1,
            comments: [...currentComments, newComment],
          };
        }
        return p;
      })
    );

    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    setExpandedComments((prev) => ({ ...prev, [postId]: true }));
  };

  // Handle Share button click
  const handleSharePost = (postId: string) => {
    setFeedPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, shares: p.shares + 1 } : p))
    );
    showToast('Link copied to clipboard!');
  };

  // Helper to render formatted text with clickable tags
  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(@[\w\s.-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const tagText = part.substring(1).trim();
        const matchedBand = DAVAO_ARTISTS_LIST.find(
          (b) => b.name.toLowerCase() === tagText.toLowerCase() || b.handle.toLowerCase() === `@${tagText.toLowerCase()}`
        );

        if (matchedBand && onSelectArtist) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectArtist(matchedBand.id)}
              className="font-bold text-[#53E6D4] hover:underline cursor-pointer inline-block"
            >
              {part}
            </button>
          );
        }

        return (
          <span key={index} className="font-semibold text-[#53E6D4]">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 px-2 sm:px-4 py-3 pb-32">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#6045F4] text-white text-xs font-semibold shadow-2xl border border-white/20 animate-fadeIn flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#53E6D4]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden File Input for Image Upload (STRICTLY IMAGES ONLY - NO VIDEOS) */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ========================================================================= */}
      {/* 1. GUEST CONNECT CALLOUT: LOGIN OR REGISTER FIRST                         */}
      {/* Lane 1: Title in one lane. Lane 2: Info text. Lane 3: Button next.       */}
      {/* ========================================================================= */}
      {!isLoggedIn ? (
        <div className="rounded-2xl bg-[#161B20] border border-white/10 shadow-lg p-4 sm:p-5 relative overflow-hidden space-y-2.5">
          {/* Ambient accent glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#6045F4]/15 rounded-full blur-2xl pointer-events-none" />

          {/* Lane 1: Title (strictly single lane / one line) */}
          <div className="flex items-center gap-2 relative z-10">
            <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-pulse flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-heading font-extrabold text-white tracking-wide whitespace-nowrap truncate">
              Davao Soundstage Community
            </h2>
          </div>

          {/* Lane 2: Info (next lane) */}
          <p className="text-xs text-[#8E9AA7] leading-relaxed relative z-10">
            Log in or register first to start connecting with others, posting live gig updates, tagging local bands, and sharing concert photos.
          </p>

          {/* Lane 3: Action Button (next lane) */}
          <div className="pt-1 relative z-10">
            <button
              type="button"
              onClick={onNavigateToAuth}
              id="feed-login-register-btn"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white text-xs font-heading font-bold flex items-center justify-center gap-2 shadow-md shadow-[#6045F4]/30 transition-all cursor-pointer active:scale-95"
            >
              <LogIn className="w-4 h-4 text-[#53E6D4]" />
              <span>Log In or Register</span>
            </button>
          </div>
        </div>
      ) : (
        /* FACEBOOK STYLE: "CREATE POST" COMPOSER CARD (When Logged In) */
        <div className="rounded-2xl bg-[#161B20] border border-white/10 shadow-lg p-3.5 sm:p-4 space-y-3">
          {/* Top identity bar: shows guest or band selector */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <img
                src={
                  authorType === 'band'
                    ? (DAVAO_ARTISTS_LIST.find((a) => a.name === selectedBandName)?.avatar ||
                       'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&auto=format&fit=crop&q=80')
                    : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80'
                }
                alt="Author Avatar"
                className="w-9 h-9 rounded-full object-cover border border-white/15"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">
                    {authorType === 'band' ? selectedBandName : (guestFanName.trim() || 'Music Lover')}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300 font-mono">
                    {authorType === 'band' ? 'Band' : 'Fan'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthorPicker((prev) => !prev)}
                  className="text-[10px] text-[#53E6D4] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Switch Author ({authorType === 'fan' ? 'Posting as Fan' : 'Posting as Band'})</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-[#8E9AA7]">
              <Globe className="w-3 h-3 text-[#53E6D4]" />
              <span>Public</span>
            </div>
          </div>

          {/* Author picker drawer */}
          {showAuthorPicker && (
            <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 space-y-2.5 animate-fadeIn">
              <p className="text-[11px] font-semibold text-slate-300">Choose who to post as:</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthorType('fan')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                    authorType === 'fan'
                      ? 'bg-[#53E6D4] text-[#0F1417] border-[#53E6D4]'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Fan / Gig Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setAuthorType('band')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                    authorType === 'band'
                      ? 'bg-[#6045F4] text-white border-[#6045F4]'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  Local Davao Band
                </button>
              </div>

              {authorType === 'fan' ? (
                <input
                  type="text"
                  placeholder="Your Name / Handle (e.g. Rico Tan)"
                  value={guestFanName}
                  onChange={(e) => setGuestFanName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#161B20] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#6045F4]"
                />
              ) : (
                <select
                  value={selectedBandName}
                  onChange={(e) => setSelectedBandName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#161B20] border border-white/10 text-xs text-white focus:outline-none focus:border-[#6045F4]"
                >
                  {DAVAO_ARTISTS_LIST.map((artist) => (
                    <option key={artist.id} value={artist.name}>
                      {artist.name} ({artist.genre.split('/')[0].trim()})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Post text form */}
          <form onSubmit={handlePublishPost} className="space-y-3">
            <textarea
              rows={3}
              placeholder={
                authorType === 'band'
                  ? `What's new with ${selectedBandName}? Share gig announcements, rehearsal updates, or shoutouts...`
                  : "What's on your mind? Share gig buzz, guitar tone, or Davao live sightings..."
              }
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F1417] border border-white/10 text-white placeholder-[#8E9AA7] text-xs sm:text-sm focus:outline-none focus:border-[#6045F4] leading-relaxed resize-none"
            />

            {/* Selected Tag Pills */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-[#8E9AA7]">Tagged:</span>
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#53E6D4] text-[10px] font-semibold flex items-center gap-1"
                  >
                    <span>@{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      className="hover:text-white cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Selected Image Preview (Images only) */}
            {selectedImage && (
              <div className="relative rounded-xl overflow-hidden border border-white/15 max-h-60 bg-black/50 group">
                <img
                  src={selectedImage}
                  alt="Upload preview"
                  className="w-full h-full object-cover max-h-60"
                />
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[9px] text-white">
                  Photo attached
                </span>
              </div>
            )}

            {/* Tag Selector Drawer */}
            {showTagPicker && (
              <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white">Tag Bands or Venues in Davao:</span>
                  <button
                    type="button"
                    onClick={() => setShowTagPicker(false)}
                    className="text-[10px] text-[#8E9AA7] hover:text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {POPULAR_TAGS.map((t) => {
                    const isSelected = selectedTags.includes(t.label);
                    return (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => handleToggleTag(t.label)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-[#53E6D4] text-[#0F1417] border-[#53E6D4]'
                            : 'bg-[#161B20] text-slate-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        {t.type === 'band' ? '🎸' : '📍'} @{t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom tag input */}
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Or type custom tag..."
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag(e);
                      }
                    }}
                    className="flex-1 px-2.5 py-1 rounded-lg bg-[#161B20] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-[#6045F4] text-white text-[11px] font-semibold cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}

            {/* Image Picker Drawer (Preset concert photos or local file) */}
            {showImagePicker && (
              <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white">Attach Image (No Videos Allowed):</span>
                  <button
                    type="button"
                    onClick={() => setShowImagePicker(false)}
                    className="text-[10px] text-[#8E9AA7] hover:text-white cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                {/* Local File Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 rounded-xl bg-[#161B20] hover:bg-white/10 border border-dashed border-white/20 text-xs text-[#53E6D4] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Upload Photo from Device (JPG / PNG)</span>
                </button>

                {/* Quick Preset Concert Photos */}
                <div>
                  <p className="text-[10px] text-[#8E9AA7] mb-1.5">Or choose a live concert snapshot:</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {PRESET_CONCERT_PHOTOS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setSelectedImage(p.url);
                          setShowImagePicker(false);
                        }}
                        className="group relative h-16 rounded-lg overflow-hidden border border-white/10 hover:border-[#53E6D4] cursor-pointer"
                      >
                        <img src={p.url} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Facebook Composer Action Bar (Strictly Single Lane) */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1.5 sm:gap-2 flex-nowrap">
              <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
                {/* Photo Button */}
                <button
                  type="button"
                  onClick={() => setShowImagePicker((prev) => !prev)}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    selectedImage
                      ? 'bg-[#53E6D4]/15 text-[#53E6D4] border border-[#53E6D4]/40'
                      : 'bg-white/5 hover:bg-white/10 text-emerald-400'
                  }`}
                  title="Attach photo (strictly images only)"
                >
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Photo</span>
                </button>

                {/* Tag Band Button (Smaller text, single lane) */}
                <button
                  type="button"
                  onClick={() => setShowTagPicker((prev) => !prev)}
                  id="composer-tag-band-btn"
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    selectedTags.length > 0
                      ? 'bg-[#6045F4]/20 text-[#53E6D4] border border-[#6045F4]/40'
                      : 'bg-white/5 hover:bg-white/10 text-sky-400'
                  }`}
                  title="Tag bands or venues"
                >
                  <TagIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[10px] sm:text-[11px] whitespace-nowrap">Tag Band</span>
                </button>

                {/* Quick Feeling / Activity Tag */}
                <button
                  type="button"
                  onClick={() => {
                    if (!postContent.includes('🤘 at Matina Town Square')) {
                      setPostContent((prev) => (prev ? `${prev} — feeling hyped 🤘 at Matina Town Square` : 'Feeling hyped 🤘 at Matina Town Square!'));
                    }
                  }}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-amber-400 cursor-pointer whitespace-nowrap flex-shrink-0"
                  title="Add mood"
                >
                  <Smile className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Feeling</span>
                </button>
              </div>

              {/* Facebook Post Button */}
              <button
                type="submit"
                disabled={!postContent.trim() && !selectedImage}
                className={`px-3.5 sm:px-4 py-1.5 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition-all shadow-md active:scale-95 whitespace-nowrap flex-shrink-0 ${
                  postContent.trim() || selectedImage
                    ? 'bg-[#6045F4] hover:bg-[#7A62FF] text-white cursor-pointer shadow-[#6045F4]/30'
                    : 'bg-white/10 text-slate-500 cursor-not-allowed opacity-60'
                }`}
              >
                <Send className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Post</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FACEBOOK FEED STREAM (POSTS FROM BANDS & FANS)                            */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        {feedPosts.map((post) => {
          const isLiked = post.userReactions.includes('rock');
          const totalReactions = 
            (post.reactions.rock || 0) + 
            (post.reactions.fire || 0) + 
            (post.reactions.orchid || 0) + 
            (post.reactions.durian || 0);
          const isCommentsOpen = !!expandedComments[post.id];
          const postComments = post.comments || [];

          return (
            <article
              key={post.id}
              className="rounded-2xl bg-[#161B20] border border-white/10 shadow-lg overflow-hidden space-y-3 p-3.5 sm:p-4 transition-all hover:border-white/15"
            >
              {/* 1. Post Header: Avatar, Name, Role Badge, Timestamp & Public Icon */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={post.authorAvatar}
                    alt={post.authorName}
                    onClick={() => {
                      if (post.authorRole === 'artist' && onSelectArtist) {
                        const matched = DAVAO_ARTISTS_LIST.find((a) => a.name.toLowerCase() === post.authorName.toLowerCase());
                        if (matched) onSelectArtist(matched.id);
                      }
                    }}
                    className={`w-10 h-10 rounded-full object-cover border border-white/15 flex-shrink-0 ${
                      post.authorRole === 'artist' ? 'cursor-pointer hover:border-[#53E6D4]' : ''
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3
                        onClick={() => {
                          if (post.authorRole === 'artist' && onSelectArtist) {
                            const matched = DAVAO_ARTISTS_LIST.find((a) => a.name.toLowerCase() === post.authorName.toLowerCase());
                            if (matched) onSelectArtist(matched.id);
                          }
                        }}
                        className={`text-xs sm:text-sm font-heading font-bold text-white truncate ${
                          post.authorRole === 'artist' ? 'hover:text-[#53E6D4] cursor-pointer' : ''
                        }`}
                      >
                        {post.authorName}
                      </h3>

                      {/* Verified Badge for Bands */}
                      {post.authorRole === 'artist' ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#53E6D4] text-[9px] font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Band</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300 text-[9px] font-medium">
                          Fan
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#8E9AA7] flex items-center gap-1 mt-0.5">
                      <span>{post.timeAgo}</span>
                      <span>•</span>
                      <span className="text-[#53E6D4] font-medium">{post.districtTag}</span>
                      <span>•</span>
                      <Globe className="w-3 h-3 text-[#8E9AA7]" />
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => showToast('Post saved to your Davao favorites!')}
                  className="p-1 rounded-lg text-[#8E9AA7] hover:text-white hover:bg-white/10 cursor-pointer"
                  title="More options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* 2. Post Caption Content */}
              <div className="text-xs sm:text-sm text-[#EBEBED] leading-relaxed font-sans whitespace-pre-wrap">
                {renderFormattedContent(post.content)}
              </div>

              {/* Tagged Badges if present */}
              {((post.taggedBands && post.taggedBands.length > 0) || post.venueTag) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {post.taggedBands?.map((b) => (
                    <span
                      key={b}
                      onClick={() => {
                        if (onSelectArtist) {
                          const matched = DAVAO_ARTISTS_LIST.find((a) => a.name.toLowerCase() === b.toLowerCase());
                          if (matched) onSelectArtist(matched.id);
                        }
                      }}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#6045F4]/15 text-[#53E6D4] border border-[#6045F4]/30 hover:bg-[#6045F4]/30 cursor-pointer transition-colors"
                    >
                      @{b}
                    </span>
                  ))}
                  {post.venueTag && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 text-[#53E6D4]" />
                      <span>{post.venueTag}</span>
                    </span>
                  )}
                </div>
              )}

              {/* 3. Post Image (Strictly Images, NO Videos) */}
              {post.image && (
                <div
                  onClick={() => setLightboxImage({ url: post.image!, title: post.content })}
                  className="rounded-xl overflow-hidden border border-white/10 max-h-96 bg-black/40 cursor-pointer group"
                >
                  <img
                    src={post.image}
                    alt="Post image"
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                  />
                </div>
              )}

              {/* 4. Facebook Engagement Counts Bar */}
              <div className="flex items-center justify-between text-[11px] text-[#8E9AA7] pt-1 px-0.5">
                {/* Reactions cluster */}
                <div className="flex items-center gap-1">
                  <div className="flex items-center -space-x-1">
                    <span className="w-4 h-4 rounded-full bg-[#6045F4] flex items-center justify-center text-[10px] shadow-sm">
                      🤘
                    </span>
                    <span className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-[10px] shadow-sm">
                      🔥
                    </span>
                    <span className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] shadow-sm">
                      ❤️
                    </span>
                  </div>
                  <span className="font-semibold text-slate-300 pl-1">
                    {totalReactions.toLocaleString()}
                  </span>
                </div>

                {/* Comments & Shares */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleComments(post.id)}
                    className="hover:underline cursor-pointer"
                  >
                    {post.commentCount} comments
                  </button>
                  <span>•</span>
                  <span>{post.shares} shares</span>
                </div>
              </div>

              {/* 5. Facebook Action Row: Like, Comment, Share */}
              <div className="grid grid-cols-3 border-t border-b border-white/10 py-1 text-xs font-semibold text-[#8E9AA7]">
                {/* Like Button */}
                <button
                  type="button"
                  onClick={() => handleToggleLike(post.id, 'rock')}
                  className={`py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-white/5 active:scale-95 ${
                    isLiked ? 'text-[#53E6D4] font-bold' : 'hover:text-white'
                  }`}
                >
                  <span className="text-sm">{isLiked ? '🤘' : '👍'}</span>
                  <span>{isLiked ? 'Rocked' : 'Like'}</span>
                </button>

                {/* Comment Button */}
                <button
                  type="button"
                  onClick={() => handleToggleComments(post.id)}
                  className={`py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-white/5 active:scale-95 ${
                    isCommentsOpen ? 'text-white bg-white/5' : 'hover:text-white'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Comment</span>
                </button>

                {/* Share Button */}
                <button
                  type="button"
                  onClick={() => handleSharePost(post.id)}
                  className="py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:bg-white/5 hover:text-white active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              {/* 6. Interactive Comments Drawer */}
              {isCommentsOpen && (
                <div className="pt-2 space-y-3 animate-fadeIn">
                  {/* List of existing comments */}
                  {postComments.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {postComments.map((comm) => (
                        <div key={comm.id} className="flex items-start gap-2 text-xs">
                          <img
                            src={comm.authorAvatar}
                            alt={comm.authorName}
                            className="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0 mt-0.5"
                          />
                          <div className="flex-1 rounded-2xl bg-[#0F1417] p-2.5 border border-white/5 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-[11px]">
                                {comm.authorName}
                              </span>
                              <span className="text-[9px] text-[#8E9AA7]">{comm.timeAgo}</span>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed">
                              {comm.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* "Write a comment..." input field */}
                  <div className="flex items-center gap-2 pt-1">
                    <img
                      src={
                        authorType === 'band'
                          ? (DAVAO_ARTISTS_LIST.find((a) => a.name === selectedBandName)?.avatar ||
                             'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&auto=format&fit=crop&q=80')
                          : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80'
                      }
                      alt="Guest commenter"
                      className="w-7 h-7 rounded-full object-cover border border-white/15 flex-shrink-0"
                    />
                    <div className="flex-1 relative flex items-center">
                      <input
                        type="text"
                        placeholder="Write a comment..."
                        value={commentInputs[post.id] || ''}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddComment(post.id);
                          }
                        }}
                        className="w-full px-3.5 py-2 rounded-full bg-[#0F1417] border border-white/10 text-xs text-white placeholder-[#8E9AA7] focus:outline-none focus:border-[#6045F4] pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(post.id)}
                        disabled={!commentInputs[post.id]?.trim()}
                        className={`absolute right-2 p-1.5 rounded-full transition-colors cursor-pointer ${
                          commentInputs[post.id]?.trim()
                            ? 'text-[#53E6D4] hover:bg-white/10'
                            : 'text-slate-600'
                        }`}
                        title="Send comment"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Lightbox Preview Modal for Attached Images */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div className="relative max-w-2xl w-full rounded-2xl overflow-hidden bg-[#161B20] border border-white/20 shadow-2xl space-y-2">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage.url}
              alt="Full size preview"
              className="w-full max-h-[75vh] object-contain bg-black"
            />
            <div className="p-3 bg-[#161B20] text-xs text-slate-300">
              {lightboxImage.title}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
