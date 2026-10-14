import React from 'react';
import { URL_IN_TEXT, trimLinkEnd, webLink } from '../lib/links';

/** Splits plain text into text + clickable links (opens in a new tab). */
export function linkify(text: string, keyPrefix = 'l'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const raw = m[0];
    const at = m.index ?? 0;
    if (at > 0 && /[@\w]/.test(text[at - 1])) continue;   // part of an email or @mention, not a link
    const label = trimLinkEnd(raw);
    const href = webLink(label);
    if (!href) continue;
    out.push(text.slice(last, at));
    out.push(
      <a key={`${keyPrefix}${at}`} href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}
        className="text-[#53E6D4] underline underline-offset-2 break-all hover:text-white">{label}</a>,
    );
    last = at + label.length;
  }
  out.push(text.slice(last));
  return out;
}

/** A paragraph of user text with its web addresses made clickable. */
export const LinkText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <p className={className}>{linkify(text)}</p>
);

/** A social / web link chip: clickable when the value makes a valid link, plain text otherwise. */
export const SocialLink: React.FC<{ href: string | null; icon: React.ElementType; children: React.ReactNode; iconClass?: string }> = ({ href, icon: Icon, children, iconClass = 'text-[#53E6D4]' }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-[#EBEBED] underline decoration-white/30 underline-offset-2 hover:text-[#53E6D4] break-all">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />{children}
    </a>
  ) : (
    <span className="flex items-center gap-1.5 break-all"><Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />{children}</span>
  );
