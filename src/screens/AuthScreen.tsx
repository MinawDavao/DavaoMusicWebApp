import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Headphones, Lock, LogIn, Mail, MapPin, Music, User, UserPlus, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, type Role } from '../lib/db';
import { useNav } from '../nav';
import { ErrorNote, Field, btn, inputCls } from '../components/ui';
import { NameHint, nameBlocked, useNameCheck } from '../components/NameCheck';

const ROLE_HINT: Record<Role, string> = {
  fan: 'Follow bands, make playlists, RSVP to gigs and join the feed.',
  artist: 'Get a band page, upload your music and post your gigs.',
  venue: 'For bars, cafés, event places, studios and music shops. People can tag your business with @.',
};

export const AuthScreen: React.FC<{ initialMode?: 'login' | 'signup' }> = ({ initialMode = 'login' }) => {
  const go = useNav();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [role, setRole] = useState<Role>('fan');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameCheck = useNameCheck('name', mode === 'signup' ? name : '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (mode === 'signup') {
      if (!name.trim()) return setErr(role === 'fan' ? 'Please enter your name.' : role === 'venue' ? 'Please enter your venue or business name.' : 'Please enter your band or artist name.');
      if (nameBlocked('name', role, nameCheck.result)) return setErr('That name is already taken — please choose a different one.');
      if (password.length < 8) return setErr('Password must be at least 8 characters.');
      if (password !== confirm) return setErr('Passwords don’t match.');
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { role, name: name.trim() } },
        });
        if (error) throw error;
        // Testing mode: sign-ups are auto-confirmed, so log straight in if no session came back.
        if (!data.session) {
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (e2) throw e2;
        }
      }
      // App decides where to go next (Terms → profile setup → home).
    } catch (e: any) {
      const msg = errorMessage(e);
      if (/rate limit/i.test(msg)) {
        setErr('Too many sign-up emails right now. In Supabase, turn off Authentication → Sign In / Providers → Email → “Confirm email”, then try again.');
      } else if (/Email not confirmed/i.test(msg)) {
        setErr('This account isn’t confirmed yet. In Supabase, turn off “Confirm email” under Authentication → Sign In / Providers → Email.');
      } else if (/Invalid login credentials/i.test(msg)) {
        setErr('Wrong email or password.');
      } else if (/already registered/i.test(msg)) {
        setErr('An account with this email already exists. Try logging in.');
      } else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: 'login' | 'signup', label: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => { setMode(m); setErr(null); }}
      className={`flex-1 h-10 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${mode === m ? 'bg-[#6045F4] text-white' : 'text-[#8E9AA7]'}`}
    >
      <Icon className="w-4 h-4" />{label}
    </button>
  );
  const roleBtn = (r: Role, label: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => setRole(r)}
      className={`flex-1 h-10 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${role === r ? 'bg-[#53E6D4] text-[#0F1417]' : 'text-[#8E9AA7]'}`}
    >
      <Icon className="w-4 h-4" />{label}
    </button>
  );

  return (
    <div className="px-3 py-4 space-y-4">
      <button onClick={() => go({ name: 'home' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Back to Home</button>

      <form onSubmit={submit} className="rounded-3xl bg-[#1D232A] border border-white/[0.08] p-4 space-y-4">
        <div className="flex gap-1 p-1 rounded-2xl bg-[#0F1417] border border-white/15">
          {tab('login', 'Log In', LogIn)}
          {tab('signup', 'Sign Up', UserPlus)}
        </div>

        <div className="text-center space-y-1.5">
          <h1 className="font-heading font-bold text-2xl text-white">{mode === 'login' ? 'Welcome back' : 'Create Your Account'}</h1>
          <p className="text-xs text-[#8E9AA7]">
            {mode === 'login' ? 'Log in to post, upload music and join the Davao scene.' : 'Join as a Fan, an Artist, or a Venue/Business.'}
          </p>
        </div>

        {mode === 'signup' && (
          <>
            <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-xl bg-[#FFB800]/10 border border-dashed border-[#FFB800]/55 text-xs leading-relaxed">
              <Zap className="w-4 h-4 text-[#FFB800] flex-shrink-0 mt-0.5" />
              <span><strong className="text-[#FFB800]">Test mode:</strong> email verification is bypassed. New accounts are accepted instantly.</span>
            </div>
            <div role="group" aria-label="Account type" className="flex gap-1 p-1 rounded-2xl bg-[#161B20] border border-white/[0.08]">
              {roleBtn('fan', 'Fan', Headphones)}
              {roleBtn('artist', 'Artist', Music)}
              {roleBtn('venue', 'Venue/Business', MapPin)}
            </div>
            <p className="-mt-2 text-[11px] text-[#8E9AA7] text-center">{ROLE_HINT[role]}</p>
            <Field label={role === 'fan' ? 'Full Name' : role === 'venue' ? 'Venue / Business Name' : 'Band / Artist Name'} icon={User} htmlFor="su-name">
              <input id="su-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={role === 'fan' ? 'e.g. Juan Dela Cruz' : role === 'venue' ? 'e.g. Matina Music Bar' : 'e.g. Your band name'} autoComplete={role === 'fan' ? 'name' : 'organization'} />
            </Field>
            <NameHint kind="name" role={role} value={name} {...nameCheck} onPick={setName} />
          </>
        )}

        <Field label="Email Address" icon={Mail} htmlFor="au-email">
          <input id="au-email" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
        </Field>
        <Field label="Password" icon={Lock} htmlFor="au-pw" hint={mode === 'signup' ? 'at least 8 characters' : undefined}>
          <div className="relative">
            <input id="au-pw" type={show ? 'text' : 'password'} required className={`${inputCls} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#8E9AA7] cursor-pointer">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        {mode === 'signup' && (
          <Field label="Confirm Password" icon={Lock} htmlFor="au-pw2">
            <input id="au-pw2" type={show ? 'text' : 'password'} required className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        )}

        <ErrorNote text={err} />
        <button type="submit" disabled={busy} className={`${btn.mint} w-full h-12`}>
          {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
        </button>
        {mode === 'signup' && <p className="text-center text-[11px] text-[#8E9AA7]">Next, you’ll review our Terms of Agreement and set up your profile.</p>}
        <p className="text-center text-[13px] text-[#8E9AA7]">
          {mode === 'login' ? 'Don’t have an account yet? ' : 'Already have an account? '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(null); }} className="font-bold text-[#53E6D4] underline cursor-pointer">
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </form>
    </div>
  );
};
