import React, { useState } from 'react';
import { MarketplaceItem } from '../../types';
import { X, MapPin, Tag, ShieldCheck, MessageCircle, ArrowRightLeft, Check, Sparkles } from 'lucide-react';

interface GearDetailModalProps {
  item: MarketplaceItem | null;
  onClose: () => void;
}

export const GearDetailModal: React.FC<GearDetailModalProps> = ({
  item,
  onClose,
}) => {
  const [offerSent, setOfferSent] = useState(false);
  const [tradeOfferText, setTradeOfferText] = useState('');
  const [showMeetupTip, setShowMeetupTip] = useState(false);

  if (!item) return null;

  const handleSendOffer = (e: React.FormEvent) => {
    e.preventDefault();
    setOfferSent(true);
    setTimeout(() => {
      setOfferSent(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-3xl overflow-hidden border border-white/20 shadow-2xl relative flex flex-col md:flex-row max-h-[90vh] bg-[#161B20]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-[#6045F4] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Gear Photo */}
        <div className="md:w-1/2 bg-black flex items-center justify-center relative min-h-[220px] md:min-h-[380px]">
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                item.dealType === 'For Sale'
                  ? 'bg-[#53E6D4] text-[#0F1417] shadow-md'
                  : item.dealType === 'For Trade'
                  ? 'bg-[#6045F4] text-white shadow-md'
                  : 'bg-[#FFB800] text-[#0F1417] shadow-md'
              }`}
            >
              {item.dealType}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-slate-200 text-[10px] font-semibold border border-white/10">
              {item.condition}
            </span>
          </div>
        </div>

        {/* Details & Action Panel */}
        <div className="md:w-1/2 p-4 sm:p-5 flex flex-col justify-between space-y-3 overflow-y-auto">
          <div>
            <span className="text-[10px] font-mono text-[#53E6D4] uppercase tracking-wider font-bold">
              {item.category}
            </span>
            <h3 className="text-base sm:text-lg font-heading font-bold text-white mt-0.5">
              {item.title}
            </h3>

            {/* Price in PHP */}
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-heading font-extrabold text-[#53E6D4]">
                ₱{item.price.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 font-mono">PHP</span>
            </div>

            {item.tradeWishlist && (
              <div className="mt-2.5 p-2 rounded-xl bg-[#6045F4]/15 border border-[#6045F4]/30 text-xs text-slate-200">
                <span className="font-semibold text-[#7A62FF] block mb-0.5 flex items-center gap-1 text-[11px]">
                  <ArrowRightLeft className="w-3 h-3" /> Seller's Trade Wishlist:
                </span>
                <span className="text-[11px]">{item.tradeWishlist}</span>
              </div>
            )}

            <p className="text-xs text-[#8E9AA7] mt-3 leading-relaxed">
              {item.description}
            </p>

            {/* Specs */}
            <div className="mt-3 pt-2.5 border-t border-white/10">
              <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Gear Specs & Notes
              </h4>
              <ul className="space-y-1">
                {item.specs.map((spec, i) => (
                  <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#53E6D4]" />
                    <span>{spec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Seller profile card */}
            <div className="mt-3.5 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={item.sellerAvatar}
                  alt={item.sellerName}
                  className="w-8 h-8 rounded-full object-cover border border-[#6045F4]"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-white">
                      {item.sellerName}
                    </span>
                    {item.verifiedSeller && (
                      <ShieldCheck className="w-3 h-3 text-[#53E6D4]" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-[#53E6D4]" />
                    <span>{item.sellerDistrict}</span>
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400">{item.postedAgo}</span>
            </div>

            {showMeetupTip && (
              <div className="mt-2 p-2 rounded-xl bg-[#53E6D4]/10 border border-[#53E6D4]/30 text-[11px] text-[#53E6D4]">
                📍 Recommended safe public meetup: Matina Town Square (MTS) or Gaisano Mall Bajada. Test gear safely!
              </div>
            )}
          </div>

          {/* Action form */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            {offerSent ? (
              <div className="p-2.5 rounded-xl bg-[#53E6D4]/20 border border-[#53E6D4]/50 text-[#53E6D4] text-xs font-semibold flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>Message & Offer Sent to {item.sellerName}!</span>
              </div>
            ) : (
              <form onSubmit={handleSendOffer} className="space-y-2">
                <input
                  type="text"
                  placeholder="Offer cash meetup or propose gear trade..."
                  value={tradeOfferText}
                  onChange={(e) => setTradeOfferText(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#53E6D4]"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white font-heading font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Chat Seller via Tugtog In-Box</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMeetupTip((prev) => !prev)}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-semibold cursor-pointer"
                  >
                    Safe Spot
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
