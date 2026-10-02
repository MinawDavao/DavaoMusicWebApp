import React from 'react';
import { GalleryPhoto } from '../../types';
import { X, Heart, MapPin, Camera, Music, Calendar } from 'lucide-react';

interface ImageLightboxModalProps {
  photo: GalleryPhoto | null;
  onClose: () => void;
  onLikePhoto: (photoId: string) => void;
  liked: boolean;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  photo,
  onClose,
  onLikePhoto,
  liked,
}) => {
  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in">
      <div className="relative w-full max-w-4xl glass-panel rounded-3xl overflow-hidden border border-white/20 shadow-2xl flex flex-col md:flex-row">
        {/* Close Button */}
        <button
          onClick={onClose}
          id="lightbox-close-btn"
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-[#6045F4] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Large Image Frame */}
        <div className="md:w-3/5 bg-black flex items-center justify-center relative min-h-[260px] md:min-h-[480px]">
          <img
            src={photo.imageUrl}
            alt={photo.title}
            className="w-full h-full object-cover max-h-[70vh]"
          />
          <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] text-white flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#53E6D4]" />
            <span>{photo.photographer}</span>
          </div>
        </div>

        {/* Details & Community Panel */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between space-y-6 bg-[#161B20]">
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#6045F4]/20 text-[#53E6D4] border border-[#6045F4]/40">
              Davao Gig Vault
            </span>

            <h3 className="text-xl font-heading font-bold text-white leading-snug">
              {photo.title}
            </h3>

            <div className="space-y-2 text-xs text-[#8E9AA7]">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#53E6D4]" />
                <span className="font-semibold text-white">{photo.venue}</span>
              </p>
              <p className="flex items-center gap-2">
                <Music className="w-4 h-4 text-[#6045F4]" />
                <span>Tagged Band: <strong className="text-white">{photo.bandTagged}</strong></span>
              </p>
              <p className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#53E6D4]" />
                <span className="text-[#8E9AA7]">{photo.date}</span>
              </p>
            </div>

            <p className="text-xs text-[#8E9AA7] leading-relaxed pt-2 border-t border-white/10">
              Captured during the live local music showcase in Davao City. Free high-res download available for giggoers and band archives.
            </p>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={() => onLikePhoto(photo.id)}
              id="lightbox-like-btn"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                liked
                  ? 'bg-[#6045F4] text-white shadow-[0_0_20px_rgba(96,69,244,0.5)]'
                  : 'glass-card text-[#EBEBED] hover:text-white border border-white/10'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-current text-white' : 'text-rose-400'}`} />
              <span>{liked ? photo.likes + 1 : photo.likes} Gig Fans Liked</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-[#8E9AA7] hover:text-white transition-colors cursor-pointer"
            >
              Back to Feed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
