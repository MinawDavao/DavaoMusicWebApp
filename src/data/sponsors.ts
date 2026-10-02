import { AdvertisementItem } from '../types';

// Sponsored Spotlight content (static for now — an admin panel will manage sponsors later).
export const SPONSORS: AdvertisementItem[] = [
  {
    id: 'ad-1',
    title: 'Kadayawan Gear & Pedalboard Mega Sale',
    tagline: 'Up to 30% OFF on Boss, Fender & hand-forged Brass Kulintang sets.',
    sponsorName: 'MTS Music Hub & Audio Lab',
    badge: 'EXCLUSIVE SCENE DEAL',
    imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=80',
    ctaText: 'Learn More',
    promoCode: 'TUGTOG30',
    details: 'Matina Town Square branch exclusive. Show your Tugtog Davao app profile at the cashier counter to receive an instant 30% discount on select guitar effects, amplifiers, and strings.',
    dealUrl: 'deals'
  },
  {
    id: 'ad-2',
    title: 'Suazo Craft Bar: Vinyl Thursdays & Craft Draft',
    tagline: 'Buy 1 Davao Craft Beer, get free entry to Analog Listening Room.',
    sponsorName: 'Suazo Bar & Soundstage',
    badge: 'WEEKLY GIG PROMO',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=900&auto=format&fit=crop&q=80',
    ctaText: 'Learn More',
    promoCode: 'SUAZO2FOR1',
    details: 'Located on Gov. Sales St, Poblacion. Acoustic vinyl listening with unreleased Davao band masters. Special rate on local cold IPAs and artisan tapas for musicians and fans.',
    dealUrl: 'deals'
  },
  {
    id: 'ad-3',
    title: 'SouthSound Rehearsal Studio Special',
    tagline: 'Book 3 Hours Rehearsal & Get a Free Live Multitrack Demo Recording.',
    sponsorName: 'SouthSound Studio Davao',
    badge: 'BAND REHEARSAL DEAL',
    imageUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=900&auto=format&fit=crop&q=80',
    ctaText: 'Learn More',
    promoCode: 'REHEARSEDVO',
    details: 'Fully acoustic-treated rooms in Matina equipped with Marshall JCM900, Ampeg SVT-CL, and Yamaha Maple Custom drums. Includes live 8-track audio recording of your session.',
    dealUrl: 'deals'
  },
  {
    id: 'ad-4',
    title: 'Southern Mindanao Indie Fest 2026',
    tagline: '24 Homegrown Bands across 2 stages at MTS Taboan. Early bird VIP passes.',
    sponsorName: 'Davao Cultural Sound Guild',
    badge: 'FESTIVAL EARLY BIRD',
    imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop&q=80',
    ctaText: 'Learn More',
    promoCode: 'INDFEST2026',
    details: 'Experience the largest independent music festival in Mindanao. VIP pass includes front-row lounge access, artist meet-and-greet pass, and exclusive screenprinted festival poster.',
    dealUrl: 'deals'
  }
];
