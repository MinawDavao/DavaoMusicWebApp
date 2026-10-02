import React, { useState, useEffect } from 'react';
import { MarketplaceItem, AdvertisementItem } from '../../types';
import { MOCK_ADVERTISEMENTS } from '../../data/mockData';
import { PostGearModal } from '../modals/PostGearModal';
import { GearDetailModal } from '../modals/GearDetailModal';
import { 
  Plus, 
  MapPin, 
  ShieldCheck, 
  ArrowRightLeft, 
  Sparkles, 
  Tag, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  MessageCircle,
  Copy,
  Check,
  Music,
  User,
  ShoppingBag,
  Share2
} from 'lucide-react';

interface MarketplaceScreenProps {
  items: MarketplaceItem[];
  onAddItem: (newItem: MarketplaceItem) => void;
  currentUserName: string;
  currentUserAvatar: string;
  currentUserDistrict: string;
  onSelectArtist?: (artistId: string) => void;
  isLoggedIn?: boolean;
  onNavigateToAuth?: () => void;
}

export const MarketplaceScreen: React.FC<MarketplaceScreenProps> = ({
  items,
  onAddItem,
  currentUserName,
  currentUserAvatar,
  currentUserDistrict,
  onSelectArtist,
  isLoggedIn = false,
  onNavigateToAuth,
}) => {
  // 1. Advertisement State (matching the Advertisement on Home)
  const [adIndex, setAdIndex] = useState(0);
  const [isAdPaused, setIsAdPaused] = useState(false);
  const [activeAdModal, setActiveAdModal] = useState<AdvertisementItem | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // 2. Modals & Filter State
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MarketplaceItem | null>(null);
  const [dealFilter, setDealFilter] = useState<'All' | 'For Sale' | 'For Trade' | 'Looking to Buy'>('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const advertisements = MOCK_ADVERTISEMENTS;
  const currentAd = advertisements[adIndex] || advertisements[0];

  // Auto-advance Advertisement every 5.0 seconds (pauses on hover/touch)
  useEffect(() => {
    if (isAdPaused) return;

    const adTimer = setInterval(() => {
      setAdIndex((prev) => (prev + 1) % advertisements.length);
    }, 5000);

    return () => clearInterval(adTimer);
  }, [isAdPaused, advertisements.length]);

  const handleNextAd = () => {
    setAdIndex((prev) => (prev + 1) % advertisements.length);
  };

  const handlePrevAd = () => {
    setAdIndex((prev) => (prev - 1 + advertisements.length) % advertisements.length);
  };

  const handleCopyPromo = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    showToast(`Promo code ${code} copied!`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const handleShareItem = (e: React.MouseEvent, title: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${window.location.origin}/deals?item=${encodeURIComponent(title)}`);
    showToast('Post link copied to clipboard!');
  };

  // Filter items simply by deal type
  const filteredItems = items.filter((item) => {
    if (dealFilter === 'All') return true;
    if (dealFilter === 'For Sale') return item.dealType === 'For Sale' || item.dealType === 'Sale or Trade';
    if (dealFilter === 'For Trade') return item.dealType === 'For Trade' || item.dealType === 'Sale or Trade';
    if (dealFilter === 'Looking to Buy') return item.dealType === 'Looking to Buy' || item.dealType === 'Want to Buy';
    return true;
  });

  return (
    <div className="min-h-screen text-[#EBEBED] relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#6045F4] text-white text-xs font-semibold shadow-2xl border border-white/20 animate-fadeIn flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#53E6D4]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ADVERTISEMENT ON TOP (FIXED / STICKY SO IT NEVER DISAPPEARS ON SCROLL) */}
      {/* ========================================================================= */}
      <div 
        className="sticky top-[58px] sm:top-[68px] z-30 w-full bg-[#0F1417]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl transition-all"
        onMouseEnter={() => setIsAdPaused(true)}
        onMouseLeave={() => setIsAdPaused(false)}
        onTouchStart={() => setIsAdPaused(true)}
        onTouchEnd={() => setIsAdPaused(false)}
      >
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          
          {/* Top Label & Slide Controls Row */}
          <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-pulse flex-shrink-0" />
              <span className="font-heading font-extrabold uppercase tracking-wider text-xs text-[#53E6D4] flex items-center gap-1">
                <Tag className="w-3 h-3 text-[#6045F4]" />
                Sponsored Spotlight
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden xs:inline">• Scene Deals</span>
            </div>

            {/* Prev / Next & Slide Dots Controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-1 mr-1">
                {advertisements.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAdIndex(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      adIndex === idx ? 'w-4 bg-[#53E6D4]' : 'w-1.5 bg-white/20 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handlePrevAd}
                aria-label="Previous advertisement"
                className="w-5 h-5 rounded-md bg-white/5 hover:bg-[#6045F4] text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-slate-400 px-0.5">
                {adIndex + 1}/{advertisements.length}
              </span>
              <button
                onClick={handleNextAd}
                aria-label="Next advertisement"
                className="w-5 h-5 rounded-md bg-white/5 hover:bg-[#6045F4] text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Advertisement Banner Card (Compact Horizontal Layout: Image Left, Details Right) */}
          <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#181D24] via-[#14191F] to-[#12161A] border border-[#6045F4]/30 hover:border-[#6045F4]/60 p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3.5 transition-all shadow-md group">
            
            {/* Ad Image Thumbnail */}
            <div 
              onClick={() => setActiveAdModal(currentAd)}
              className="relative w-20 h-20 sm:w-28 sm:h-20 rounded-lg sm:rounded-xl overflow-hidden bg-black flex-shrink-0 cursor-pointer shadow-md"
            >
              <img
                src={currentAd.imageUrl}
                alt={currentAd.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-1 left-1 right-1">
                <span className="text-[8px] font-extrabold uppercase px-1 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[#53E6D4] block truncate">
                  {currentAd.badge.split(' ')[0]} DEAL
                </span>
              </div>
            </div>

            {/* Ad Content */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Sponsor & Headline */}
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="text-[#A78BFA] font-medium truncate">
                  {currentAd.sponsorName}
                </span>
                {currentAd.promoCode && (
                  <button
                    onClick={() => handleCopyPromo(currentAd.promoCode!)}
                    className="flex-shrink-0 font-mono text-[10px] text-[#53E6D4] hover:underline bg-[#0C1014] px-1.5 py-0.5 rounded border border-[#53E6D4]/30 cursor-pointer flex items-center gap-1"
                    title="Click to copy promo code"
                  >
                    <span>{currentAd.promoCode}</span>
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              <h3 
                onClick={() => setActiveAdModal(currentAd)}
                className="font-heading font-extrabold text-white text-xs sm:text-sm leading-snug truncate group-hover:text-[#53E6D4] transition-colors cursor-pointer"
              >
                {currentAd.title}
              </h3>

              <p className="text-[11px] text-[#8E9AA7] line-clamp-1">
                {currentAd.tagline}
              </p>

              {/* Action */}
              <div className="pt-0.5 flex items-center gap-2">
                <button
                  onClick={() => setActiveAdModal(currentAd)}
                  id="deals-ad-learn-more-btn"
                  className="px-2.5 py-1 rounded-lg bg-[#6045F4] hover:bg-[#7A62FF] text-white font-heading font-bold text-[10px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-[0_0_8px_rgba(96,69,244,0.4)]"
                >
                  <span>Learn More</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LIST OF POSTS: BUY, SELL OR TRADE BY A USER OR A BAND                 */}
      {/* "That's it. Keep it simple."                                              */}
      {/* ========================================================================= */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-3 pb-28 space-y-3.5">
        
        {/* Simple Top Bar: Title, Filter Pills, and Post Gear Button */}
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 pb-1 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-heading font-extrabold text-white">
              Gear Exchange <span className="text-[#53E6D4]">({filteredItems.length})</span>
            </h1>
            <span className="text-[11px] text-[#8E9AA7] hidden sm:inline">
              • Davao musicians & bands
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-[#161B20] p-0.5 rounded-lg border border-white/10 text-[10px] font-semibold">
              {(['All', 'For Sale', 'For Trade', 'Looking to Buy'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDealFilter(tab)}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    dealFilter === tab
                      ? 'bg-[#6045F4] text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab === 'Looking to Buy' ? 'WTB' : tab}
                </button>
              ))}
            </div>

            {/* List Gear Button (Only available when logged in) */}
            {isLoggedIn && (
              <button
                onClick={() => setIsPostModalOpen(true)}
                id="deals-post-gear-btn"
                className="px-2.5 py-1.5 rounded-lg bg-[#53E6D4] hover:bg-[#68fae8] text-[#0F1417] text-[11px] font-heading font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-md flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Post</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="rounded-2xl p-8 text-center bg-[#161B20] border border-white/10 space-y-2">
            <ShoppingBag className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-sm font-bold text-white">No posts in this category</h4>
            <p className="text-xs text-slate-400">Be the first to list a buy, sell, or trade post.</p>
            <button
              onClick={() => setDealFilter('All')}
              className="mt-2 px-3 py-1.5 rounded-lg bg-[#6045F4] text-white text-xs font-semibold"
            >
              Show All Posts
            </button>
          </div>
        )}

        {/* List of Posts */}
        {filteredItems.map((item) => {
          const isBand = item.sellerRole === 'band';
          const isTrade = item.dealType === 'For Trade' || item.dealType === 'Sale or Trade';
          const isWTB = item.dealType === 'Looking to Buy' || item.dealType === 'Want to Buy';

          return (
            <article
              key={item.id}
              className="rounded-2xl bg-[#161B20] border border-white/10 hover:border-white/20 transition-all overflow-hidden shadow-lg space-y-2.5 p-3.5 sm:p-4"
            >
              
              {/* Post Header: Author Avatar, Name, Band/User Badge, Location & Time */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div 
                    className="relative flex-shrink-0 cursor-pointer"
                    onClick={() => {
                      if (isBand && item.sellerBandId && onSelectArtist) {
                        onSelectArtist(item.sellerBandId);
                      }
                    }}
                  >
                    <img
                      src={item.sellerAvatar}
                      alt={item.sellerName}
                      className="w-9 h-9 rounded-full object-cover border border-white/15"
                    />
                    {isBand && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#6045F4] border-2 border-[#161B20] flex items-center justify-center text-[7px] text-white">
                        <Music className="w-2 h-2" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 
                        onClick={() => {
                          if (isBand && item.sellerBandId && onSelectArtist) {
                            onSelectArtist(item.sellerBandId);
                          }
                        }}
                        className={`font-heading font-bold text-xs sm:text-sm text-white truncate hover:text-[#53E6D4] transition-colors ${
                          isBand ? 'cursor-pointer' : ''
                        }`}
                      >
                        {item.sellerName}
                      </h3>

                      {/* Band vs Musician Badge */}
                      {isBand ? (
                        <span className="px-1.5 py-0.2 rounded bg-[#6045F4]/30 border border-[#6045F4]/50 text-[#A78BFA] text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5">
                          <Music className="w-2.5 h-2.5 text-[#53E6D4]" />
                          Band
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-white/10 text-slate-300 text-[9px] font-medium flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5" />
                          Musician
                        </span>
                      )}

                      {item.verifiedSeller && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 text-[#53E6D4]" />
                        {item.sellerDistrict.split(',')[0]}
                      </span>
                      <span>•</span>
                      <span>{item.postedAgo}</span>
                    </div>
                  </div>
                </div>

                {/* Deal Type Badge */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm ${
                      item.dealType === 'For Sale'
                        ? 'bg-[#53E6D4] text-[#0F1417]'
                        : isWTB
                        ? 'bg-[#FFB800] text-[#0F1417]'
                        : item.dealType === 'For Trade'
                        ? 'bg-[#6045F4] text-white'
                        : 'bg-gradient-to-r from-[#53E6D4] to-[#6045F4] text-black font-extrabold'
                    }`}
                  >
                    {item.dealType}
                  </span>
                </div>
              </div>

              {/* Title & Price Row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#53E6D4] font-bold block mb-0.5">
                    {item.category} • {item.condition}
                  </span>
                  <h2 
                    onClick={() => setSelectedItemForDetail(item)}
                    className="font-heading font-extrabold text-white text-sm sm:text-base leading-snug hover:text-[#53E6D4] transition-colors cursor-pointer"
                  >
                    {item.title}
                  </h2>
                </div>

                {/* Price Display */}
                <div className="text-right flex-shrink-0">
                  <span className="text-base sm:text-lg font-heading font-extrabold text-[#53E6D4]">
                    ₱{item.price.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-mono">
                    {isWTB ? 'budget' : 'PHP'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                {item.description}
              </p>

              {/* Trade Wishlist Callout */}
              {item.tradeWishlist && (
                <div className="p-2 rounded-xl bg-[#6045F4]/15 border border-[#6045F4]/30 text-xs flex items-start gap-1.5 text-slate-200">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-[#A78BFA]">Trade Wishlist: </span>
                    <span>{item.tradeWishlist}</span>
                  </div>
                </div>
              )}

              {/* Photo Display (Crisp, High Quality, Clickable) */}
              <div 
                onClick={() => setSelectedItemForDetail(item)}
                className="relative rounded-xl overflow-hidden bg-black max-h-72 w-full cursor-pointer group shadow-md"
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-56 sm:h-64 object-cover group-hover:scale-102 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] text-slate-300 border border-white/10">
                  Click to inspect gear specs
                </div>
              </div>

              {/* Specs Pills (if available) */}
              {item.specs && item.specs.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.specs.slice(0, 3).map((spec, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[10px] text-slate-300 font-mono"
                    >
                      ✓ {spec}
                    </span>
                  ))}
                </div>
              )}

              {/* Post Footer Action Bar */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedItemForDetail(item)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white font-heading font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[0_0_10px_rgba(96,69,244,0.3)]"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#53E6D4]" />
                    <span>Inquire / Offer</span>
                  </button>

                  <button
                    onClick={() => setSelectedItemForDetail(item)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    View Details
                  </button>
                </div>

                <button
                  onClick={(e) => handleShareItem(e, item.title)}
                  title="Share listing"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>

            </article>
          );
        })}

      </div>

      {/* ========================================================================= */}
      {/* 3. MODALS: POST GEAR MODAL & GEAR DETAIL MODAL                            */}
      {/* ========================================================================= */}
      <PostGearModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        onPostGear={(newItem) => {
          onAddItem(newItem);
          showToast('Gear deal posted to community!');
        }}
        sellerName={currentUserName}
        sellerAvatar={currentUserAvatar}
        defaultDistrict={currentUserDistrict}
      />

      <GearDetailModal
        item={selectedItemForDetail}
        onClose={() => setSelectedItemForDetail(null)}
      />

      {/* ========================================================================= */}
      {/* 4. ADVERTISEMENT DETAILS MODAL (Matching Home)                           */}
      {/* ========================================================================= */}
      {activeAdModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
          onClick={() => setActiveAdModal(null)}
        >
          <div 
            className="w-full max-w-lg rounded-3xl bg-[#161B20] border border-white/15 p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#53E6D4] animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#A78BFA] font-bold">
                  {activeAdModal.sponsorName}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#6045F4]/30 text-[#53E6D4] text-[9px] font-extrabold uppercase">
                {activeAdModal.badge}
              </span>
            </div>

            <div>
              <h2 className="text-base sm:text-lg font-heading font-extrabold text-white">
                {activeAdModal.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {activeAdModal.tagline}
              </p>
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black h-48 sm:h-56">
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

            <div className="pt-2 flex items-center justify-end">
              <button
                onClick={() => setActiveAdModal(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
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
