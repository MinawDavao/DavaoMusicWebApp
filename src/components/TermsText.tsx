import React from 'react';

const Sec: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="space-y-2 pb-3.5 border-b border-white/[0.08]">
    <h3 className="flex items-baseline gap-2 font-heading font-bold text-sm text-white">
      <span className="font-mono text-[11px] text-[#53E6D4]">{String(n).padStart(2, '0')}</span>{title}
    </h3>
    <div className="space-y-2 text-xs leading-relaxed text-[#EBEBED]">{children}</div>
  </div>
);

/** Terms of Agreement v2026-10 (draft — have it reviewed before launch). */
export const TermsText: React.FC = () => (
  <div className="space-y-3.5">
    <Sec n={1} title="Welcome to MINAW DAVAO">
      <p>MINAW DAVAO is a community app for Davao City and Southern Mindanao musicians and fans. By creating an account you agree to these Terms of Agreement and our Community Guidelines.</p>
      <p>You must be at least 13 years old to use the app. If you are under 18, you confirm that a parent or guardian has agreed to these terms with you.</p>
    </Sec>
    <Sec n={2} title="Your Account">
      <p>Give accurate information when you sign up and keep your password private. You are responsible for everything posted from your account. One person or band per account; do not pretend to be another artist, band or venue.</p>
      <p>Venue accounts are for bars, cafés, event places and other spaces that host music. Only the owner, the manager, or someone they have allowed may run a venue’s account.</p>
    </Sec>
    <Sec n={3} title="Music, Copyright & Downloads">
      <p><strong className="text-white">You keep ownership of your music.</strong> Uploading a song does not transfer your copyright to MINAW DAVAO.</p>
      <p>Only upload music you wrote, recorded or have permission to share. Covers, remixes and samples need the original rights holder’s permission. Do not upload other artists’ songs.</p>
      <p>By uploading, you give MINAW DAVAO permission to host, stream and display your tracks inside the app so fans can listen. You can remove a track at any time.</p>
      <p><strong className="text-white">Downloads are the artist’s choice.</strong> Each artist decides whether fans can download their tracks. Downloaded music is for personal listening only. Re-uploading, selling, or sharing it elsewhere without the artist’s permission is not allowed.</p>
      <p>If you believe your music was uploaded without permission, report it. Proven infringing tracks are removed, and repeat infringers lose their accounts.</p>
    </Sec>
    <Sec n={4} title="Community Guidelines">
      <p>Keep MINAW DAVAO about music and the local scene. You may not post, upload, comment or message content that includes:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong className="text-white">Nudity or sexual content</strong>, including in profile photos, gig posters and gear listings.</li>
        <li><strong className="text-white">Violence or gore</strong>, threats, or content that encourages anyone to hurt themselves or others.</li>
        <li><strong className="text-white">Political posts</strong>: campaigning, candidates, parties, political ads or propaganda. This is a politics-free space for music.</li>
        <li>Hate speech, bullying or harassment based on who someone is.</li>
        <li>Scams, fake listings, spam, or misleading promotions.</li>
        <li>Anyone’s private information shared without their consent.</li>
      </ul>
    </Sec>
    <Sec n={5} title="Gear Exchange & Deals">
      <p>Deals happen directly between users. MINAW DAVAO is not a party to any sale or trade and does not guarantee items, payments or meetups. Describe gear honestly, meet in safe public places, and never post stolen or illegal items.</p>
    </Sec>
    <Sec n={6} title="Review & Removal">
      <p>Anyone can report a post, track, comment, profile or listing. Our moderators review every report.</p>
      <p>To keep the feed spam-free, the app limits how often you can post (3 posts every 10 minutes, 20 a day) and reply (no more than 3 replies in a row on the same post), and blocks repeated identical posts. Testimonials only appear on a band or venue page after its owner approves them.</p>
      <p>Content that is found to break these terms is removed. Depending on how serious it is, we may also warn you, suspend your account, or ban it permanently. You can appeal a decision by emailing [SUPPORT EMAIL].</p>
    </Sec>
    <Sec n={7} title="Privacy">
      <p>We collect the information you give us (like your name, email and uploads) to run the app. We do not sell your personal data. We handle personal information in line with the Philippine Data Privacy Act of 2012 (RA 10173).</p>
    </Sec>
    <Sec n={8} title="Changes & Contact">
      <p>We may update these terms as the app grows and will notify you in the app when we do. Questions? Contact us at [SUPPORT EMAIL].</p>
    </Sec>
  </div>
);
