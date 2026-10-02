import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/** Full-screen photo viewer. Pass several images to swipe through them. */
export const Lightbox: React.FC<{ images: string[]; start?: number; alt?: string; onClose: () => void }> = ({ images, start = 0, alt = '', onClose }) => {
  const [i, setI] = useState(start);
  const many = images.length > 1;
  const prev = () => setI((x) => (x - 1 + images.length) % images.length);
  const next = () => setI((x) => (x + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (many && e.key === 'ArrowLeft') prev();
      if (many && e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [many]);

  // simple swipe
  const [x0, setX0] = useState<number | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (x0 === null || !many) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) { dx > 0 ? prev() : next(); }
        setX0(null);
      }}
    >
      <img src={images[i]} alt={alt} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain select-none" />
      <button onClick={onClose} aria-label="Close photo" className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
      {many && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronLeft className="w-6 h-6" /></button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronRight className="w-6 h-6" /></button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-mono">{i + 1} / {images.length}</span>
        </>
      )}
    </div>
  );
};

/** An image that opens full screen when tapped. */
export const ZoomImg: React.FC<{ src: string; alt?: string; className?: string; gallery?: string[]; index?: number }> = ({
  src, alt = '', className = '', gallery, index = 0,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={`View ${alt || 'photo'} full size`} className="block w-full p-0 border-0 bg-transparent cursor-zoom-in">
        <img src={src} alt={alt} className={className} />
      </button>
      {open && <Lightbox images={gallery || [src]} start={gallery ? index : 0} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};
