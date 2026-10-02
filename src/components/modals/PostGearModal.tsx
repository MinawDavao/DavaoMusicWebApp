import React, { useState } from 'react';
import { MarketplaceItem } from '../../types';
import { X, ShoppingBag, MapPin, Tag, ShieldCheck, DollarSign } from 'lucide-react';

interface PostGearModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostGear: (item: MarketplaceItem) => void;
  sellerName: string;
  sellerAvatar: string;
  defaultDistrict: string;
}

export const PostGearModal: React.FC<PostGearModalProps> = ({
  isOpen,
  onClose,
  onPostGear,
  sellerName,
  sellerAvatar,
  defaultDistrict,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MarketplaceItem['category']>('Guitars & Bass');
  const [dealType, setDealType] = useState<MarketplaceItem['dealType']>('For Sale');
  const [price, setPrice] = useState('15000');
  const [tradeWishlist, setTradeWishlist] = useState('');
  const [condition, setCondition] = useState<MarketplaceItem['condition']>('Like Mint');
  const [district, setDistrict] = useState('Matina');
  const [description, setDescription] = useState('');
  const [specsInput, setSpecsInput] = useState('');

  if (!isOpen) return null;

  const categories: MarketplaceItem['category'][] = [
    'Guitars & Bass',
    'Pedals & FX',
    'Drums & Percussion',
    'Keys & Synths',
    'Amps & Audio',
    'Accessories',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const gearItem: MarketplaceItem = {
      id: `gear-${Date.now()}`,
      title: title.trim(),
      category,
      dealType,
      price: parseFloat(price) || 0,
      tradeWishlist: tradeWishlist.trim() || undefined,
      condition,
      sellerName,
      sellerAvatar,
      sellerDistrict: `${district}, Davao City`,
      postedAgo: 'Just now',
      image:
        category === 'Pedals & FX'
          ? 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=700&auto=format&fit=crop&q=80'
          : category === 'Drums & Percussion'
          ? 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=700&auto=format&fit=crop&q=80'
          : category === 'Keys & Synths'
          ? 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=700&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1550291652-6ea9114a47b1?w=700&auto=format&fit=crop&q=80',
      description: description.trim() || 'Listed on Davao Musician Marketplace. Tested and ready for local gigs.',
      specs: specsInput
        ? specsInput.split(',').map((s) => s.trim())
        : ['Tested in Davao studio', 'Original hardware', 'Good working condition'],
      verifiedSeller: true,
    };

    onPostGear(gearItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-5 sm:p-6 border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto bg-[#161B20]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base sm:text-lg font-heading font-bold text-white flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-[#53E6D4]" />
          <span>List Instrument or Gear in Davao</span>
        </h3>
        <p className="text-xs text-[#8E9AA7] mt-0.5">
          Reach fellow musicians across Matina, Buhangin, Bajada, and Torres St.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Gear Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ibanez TS9 Tube Screamer Overdrive"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs focus:outline-none focus:border-[#6045F4]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MarketplaceItem['category'])}
                className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c} className="bg-[#0F1417]">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Deal Type
              </label>
              <select
                value={dealType}
                onChange={(e) => setDealType(e.target.value as MarketplaceItem['dealType'])}
                className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs focus:outline-none"
              >
                <option value="For Sale">For Sale (PHP ₱)</option>
                <option value="For Trade">For Trade / Swap Only</option>
                <option value="Sale or Trade">Sale or Trade</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Price (PHP ₱)
              </label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as MarketplaceItem['condition'])}
                className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs"
              >
                <option value="Brand New">Brand New</option>
                <option value="Like Mint">Like Mint</option>
                <option value="Gig-Tested">Gig-Tested</option>
                <option value="Vintage / Relic">Vintage / Relic</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Davao District
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. Matina"
                className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs"
              />
            </div>
          </div>

          {dealType !== 'For Sale' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Trade Wishlist
              </label>
              <input
                type="text"
                placeholder="e.g. Open to trade with bass pedals or acoustic guitar..."
                value={tradeWishlist}
                onChange={(e) => setTradeWishlist(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description & Meetup Spot
            </label>
            <textarea
              rows={2}
              placeholder="State working condition and preferred meetup spot (e.g. Gaisano Mall Bajada, SM Ecoland, MTS)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Key Specs (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. 100W Tube Head, 2-Channels, Original Footswitch"
              value={specsInput}
              onChange={(e) => setSpecsInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0F1417] border border-white/10 text-white text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-gear-post-btn"
              className="px-5 py-2 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white font-heading font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Publish Gear Listing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
