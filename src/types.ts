// Shared UI types. Database row types live in src/lib/db.ts.
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
