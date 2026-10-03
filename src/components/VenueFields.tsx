import React from 'react';
import { Building2, Map as MapIcon, MapPin, Phone, Users } from 'lucide-react';
import { VENUE_TYPES, type Profile } from '../lib/db';
import { Field, inputCls } from './ui';

/** Editable venue details (shared by venue sign-up and Edit Profile). */
export interface VenueInfo { type: string; address: string; capacity: string; contact: string; map: string }

export const venueInfoFrom = (p?: Partial<Profile> | null): VenueInfo => ({
  type: p?.venue_type ?? '',
  address: p?.venue_address ?? '',
  capacity: p?.venue_capacity ? String(p.venue_capacity) : '',
  contact: p?.venue_contact ?? '',
  map: p?.venue_map_url ?? '',
});

export const venuePatch = (v: VenueInfo) => ({
  venue_type: v.type.trim() || null,
  venue_address: v.address.trim() || null,
  venue_capacity: v.capacity ? Number(v.capacity) : null,
  venue_contact: v.contact.trim() || null,
  venue_map_url: v.map.trim() || null,
});

export const VenueFields: React.FC<{ value: VenueInfo; onChange: (v: VenueInfo) => void }> = ({ value: v, onChange }) => {
  const set = (k: keyof VenueInfo) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: e.target.value });
  return (
    <>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Building2 className="w-4 h-4 text-[#FFC34D]" />Type of place</p>
        <div className="flex flex-wrap gap-1.5">
          {VENUE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={v.type === t}
              onClick={() => onChange({ ...v, type: v.type === t ? '' : t })}
              className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer border ${v.type === t ? 'bg-[#FFB800] border-[#FFB800] text-[#0F1417]' : 'bg-[#0F1417] border-white/15 text-[#EBEBED]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <Field label="Address" icon={MapPin} htmlFor="v-addr"><input id="v-addr" maxLength={200} className={inputCls} value={v.address} onChange={set('address')} placeholder="e.g. 123 Matina Crossing, Davao City" /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Capacity" icon={Users} htmlFor="v-cap" hint="people"><input id="v-cap" inputMode="numeric" className={inputCls} value={v.capacity} onChange={(e) => onChange({ ...v, capacity: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="e.g. 150" /></Field>
        <Field label="Contact Number" icon={Phone} htmlFor="v-contact"><input id="v-contact" type="tel" maxLength={60} className={inputCls} value={v.contact} onChange={set('contact')} placeholder="+63 9XX XXX XXXX" /></Field>
      </div>
      <Field label="Google Maps Link" icon={MapIcon} htmlFor="v-map" hint="optional"><input id="v-map" maxLength={500} className={inputCls} value={v.map} onChange={set('map')} placeholder="Paste a maps.app.goo.gl link" /></Field>
    </>
  );
};

/** Validates venue details; returns an error message or null. */
export const checkVenue = (v: VenueInfo): string | null => {
  if (v.capacity && (Number(v.capacity) < 1 || Number(v.capacity) > 100000)) return 'Capacity should be between 1 and 100,000.';
  if (v.map.trim() && !/^https?:\/\//i.test(v.map.trim())) return 'The maps link should start with https://';
  return null;
};
