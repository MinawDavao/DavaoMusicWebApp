import React, { useState } from 'react';
import { Avatar } from '../components/ui';
import { Photo, cropOf } from '../components/CardBackground';

/**
 * A player's round picture inside Hoop Method: their card photo (with the part they chose) if they
 * uploaded one, otherwise their music profile photo, otherwise their initials.
 */
export const HoopFace: React.FC<{
  name?: string | null; avatar?: string | null; cardPhoto?: string | null; cardCrop?: any; size?: number;
}> = ({ name, avatar, cardPhoto, cardCrop, size = 40 }) => {
  const [bad, setBad] = useState<string | null>(null);
  if (cardPhoto && bad !== cardPhoto) {
    return (
      <span className="relative block rounded-full overflow-hidden flex-shrink-0 border border-white/15 bg-[#252D37]" style={{ width: size, height: size }} role="img" aria-label={name || ''}>
        <Photo url={cardPhoto} crop={cropOf(cardCrop)} />
        {/* a hidden copy only to notice a failed load and fall back */}
        <img src={cardPhoto} alt="" className="hidden" onError={() => setBad(cardPhoto)} />
      </span>
    );
  }
  return <Avatar src={avatar} name={name} size={size} />;
};
