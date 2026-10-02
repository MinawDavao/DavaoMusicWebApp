export type UserRole = 'fan' | 'artist';

export type ScreenType = 'home' | 'audio' | 'connect' | 'deals' | 'artist' | 'fan' | 'marketplace' | 'auth';

export interface FeaturedBand {
  id: string;
  name: string;
  genre: string;
  origin: string; // e.g. "Southern Mindanao", "Davao City - Matina"
  images: string[];
  description: string;
  trackTitle: string;
  trackDuration: string;
  trackAudioPreset?: 'indie' | 'reggae' | 'synthwave' | 'rock';
  verified: boolean;
  memberCount?: number;
}

export interface TopArtistItem {
  rank: number;
  id: string;
  name: string;
  handle: string;
  origin: string;
  genre: string;
  avatar: string;
  totalListens: number;
  topTrackTitle: string;
  verified: boolean;
}

export interface AdvertisementItem {
  id: string;
  title: string;
  tagline: string;
  sponsorName: string;
  badge: string;
  imageUrl: string;
  ctaText: string;
  promoCode?: string;
  details: string;
  dealUrl?: string;
}

export interface DavaoArtist {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  coverImage: string;
  district: string;
  genre: string;
  monthlyListeners: number;
  bio: string;
  featuredTrackTitle: string;
  featuredTrackDuration: string;
  verified: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  category: 'Festival Alert' | 'Venue News' | 'New Release' | 'Community';
  summary: string;
  publishedAt: string;
  author: string;
  imageUrl: string;
  readTime: string;
  venueOrDistrict: string;
  highlightBadge?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  role: UserRole;
  avatar: string;
  coverImage?: string;
  bio: string;
  district: string; // e.g. "Matina", "Buhangin", "Poblacion", "Torres St."
  genres?: string[];
  instruments?: string[];
  favoriteVenues?: string[];
  gigsAttended?: number;
  monthlyListeners?: number;
  badge?: string;
  verified?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  albumArt: string;
  duration: string;
  durationSec: number;
  plays: number;
  genre: string;
  releaseDate: string;
  synthPreset: 'reggae' | 'indie' | 'synthwave' | 'rock';
  audioSnippetUrl?: string;
  lyricsSnippet?: string;
}

export interface Gig {
  id: string;
  title: string;
  bandName: string;
  supportingActs?: string[];
  venue: string;
  address: string;
  district: string;
  date: string;
  dayOfWeek: string;
  time: string;
  doorCharge: string; // e.g. "₱150 w/ 1 Beer" or "Free Admission"
  status: 'confirmed' | 'selling-fast' | 'almost-full' | 'secret-set';
  coverImage: string;
  rsvpCount: number;
  isUserRsvpd?: boolean;
}

export interface Testimonial {
  id: string;
  fanName: string;
  fanAvatar: string;
  fanRole: string; // e.g., "Front Row Regular", "Davao Bassist"
  date: string;
  message: string;
  rating: number; // 1-5
  reactions: {
    fire: number;
    orchid: number;
    rock: number;
  };
}

export interface FeedComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorRole?: UserRole;
  timeAgo: string;
  content: string;
  likes?: number;
}

export interface FeedPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  authorRole: UserRole;
  verified: boolean;
  timeAgo: string;
  content: string;
  taggedBands?: string[];
  venueTag?: string;
  districtTag: string;
  image?: string;
  reactions: {
    rock: number;
    fire: number;
    orchid: number;
    durian: number;
  };
  userReactions: string[]; // which ones user clicked
  commentCount: number;
  shares: number;
  comments?: FeedComment[];
}

export interface MarketplaceItem {
  id: string;
  title: string;
  category: 'Guitars & Bass' | 'Pedals & FX' | 'Drums & Percussion' | 'Keys & Synths' | 'Amps & Audio' | 'Accessories';
  dealType: 'For Sale' | 'For Trade' | 'Sale or Trade' | 'Looking to Buy' | 'Want to Buy';
  price: number; // in PHP ₱
  tradeWishlist?: string;
  condition: 'Brand New' | 'Like Mint' | 'Gig-Tested' | 'Vintage / Relic';
  sellerName: string;
  sellerAvatar: string;
  sellerRole?: 'band' | 'user';
  sellerBandId?: string;
  sellerDistrict: string; // e.g. "Buhangin, Davao City"
  postedAgo: string;
  image: string;
  description: string;
  specs: string[];
  verifiedSeller: boolean;
}

export interface GalleryPhoto {
  id: string;
  title: string;
  venue: string;
  photographer: string;
  date: string;
  imageUrl: string;
  bandTagged: string;
  likes: number;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  trackIds: string[];
  createdAt: string;
  createdBy: string;
}
