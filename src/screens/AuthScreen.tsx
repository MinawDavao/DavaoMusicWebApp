import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Headphones, KeyRound, Lock, LogIn, Mail, MailCheck, MapPin, Music, RotateCcw, User, UserPlus } from 'lucide-react';
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

/** Only digits, at most 10 (Supabase codes are 6 digits by default). */
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 10);

/**
 * Sign-up / log-in. With email verification on, sign-up and "forgot password" email a code
 * that the person types in here (no links to open in another browser).
 */
export const AuthScreen: React.FC<{ initialMode?: 'login' | 'signup' }> = ({ initialMode = 'login' }) => {
  const go = useNav();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  // code steps: confirm a new account, or reset a forgotten password
  const [step, setStep] = useState<null | 'verify' | 'forgot' | 'reset'>(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
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
        // an existing email comes back as a user with no identities
        if (data.user && !data.session && (data.user.identities?.length ?? 1) === 0) throw new Error('already registered');
        if (!data.session) {
          // accounts that are confirmed right away (testing mode) can log straight in; otherwise ask for the emailed code
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (e2 && /Email not confirmed/i.test(errorMessage(e2))) { openVerify(false); return; }
          if (e2) throw e2;
        }
      }
      // App decides where to go next (Terms → profile setup → home).
    } catch (e: any) {
      const msg = errorMessage(e);
      if (/rate limit/i.test(msg)) {
        setErr('Too many emails were sent just now. Please wait a few minutes and try again.');
      } else if (/Email not confirmed/i.test(msg)) {
        openVerify(true);   // logging in before confirming: send a fresh code
      } else if (/Invalid login credentials/i.test(msg)) {
        setErr('Wrong email or password.');
      } else if (/already registered/i.test(msg)) {
        setErr('An account with this email already exists. Try logging in.');
      } else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- email codes
  const openVerify = async (sendNew: boolean) => {
    setStep('verify'); setCode(''); setErr(null);
    setNote(`We sent a 6-digit code to ${email.trim()}. It may take a minute — check your spam folder too.`);
    if (sendNew) await resend();
    else setCooldown(60);
  };
  const resend = async () => {
    setErr(null);
    const { error } = step === 'reset'
      ? await supabase.auth.resetPasswordForEmail(email.trim())
      : await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) { setErr(/rate limit|security purposes/i.test(error.message) ? 'Please wait a minute before asking for another code.' : errorMessage(error)); return; }
    setNote(`New code sent to ${email.trim()}.`);
    setCooldown(60);
  };
  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return setErr('Enter the 6-digit code from your email.');
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    setBusy(false);
    if (error) return setErr(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or tap “Send a new code”.' : errorMessage(error));
    // logged in — the app moves on to the Terms and profile setup
  };
  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setErr('Enter the email you signed up with.');
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) return setErr(/rate limit|security purposes/i.test(error.message) ? 'Please wait a minute before asking for another code.' : errorMessage(error));
    setStep('reset'); setCode(''); setPassword(''); setConfirm(''); setCooldown(60);
    setNote(`If ${email.trim()} has an account, we sent it a 6-digit code. Check your spam folder too.`);
  };
  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return setErr('Enter the 6-digit code from your email.');
    if (password.length < 8) return setErr('New password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords don’t match.');
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
    if (error) { setBusy(false); return setErr(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Tap “Send a new code”.' : errorMessage(error)); }
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e2) return setErr(/different from the old/i.test(e2.message) ? 'Please choose a password different from your old one.' : errorMessage(e2));
    // logged in with the new password
  };
  const backToLogin = () => { setStep(null); setMode('login'); setErr(null); setNote(null); setCode(''); };

  const codeInput = (
    <Field label="6-digit code" icon={KeyRound} htmlFor="au-code">
      <input id="au-code" inputMode="numeric" autoComplete="one-time-code" autoFocus className={`${inputCls} text-center tracking-[0.5em] font-bold text-lg`}
        value={code} onChange={(e) => setCode(digits(e.target.value))} placeholder="••••••" />
    </Field>
  );
  const resendRow = (
    <p className="text-center text-[12px] text-[#8E9AA7]">
      Didn’t get it?{' '}
      <button type="button" onClick={resend} disabled={cooldown > 0} className="font-bold text-[#53E6D4] underline cursor-pointer disabled:no-underline disabled:text-[#8E9AA7] disabled:cursor-default inline-flex items-center gap-1">
        <RotateCcw className="w-3 h-3" />{cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
      </button>
    </p>
  );

  if (step) {
    return (
      <div className="px-3 py-4 space-y-4">
        <button onClick={backToLogin} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Back to Log In</button>
        <form onSubmit={step === 'verify' ? confirmCode : step === 'forgot' ? sendReset : resetPassword} className="rounded-3xl bg-[#1D232A] border border-white/[0.08] p-4 space-y-4">
          <div className="text-center space-y-1.5">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-[#53E6D4]/15 flex items-center justify-center">
              {step === 'verify' ? <MailCheck className="w-6 h-6 text-[#53E6D4]" /> : <KeyRound className="w-6 h-6 text-[#53E6D4]" />}
            </span>
            <h1 className="font-heading font-bold text-2xl text-white">{step === 'verify' ? 'Check your email' : step === 'forgot' ? 'Forgot password' : 'Set a new password'}</h1>
            <p className="text-xs text-[#8E9AA7]">
              {step === 'forgot' ? 'Enter your email and we’ll send you a 6-digit code to reset your password.' : note}
            </p>
          </div>
          {step === 'forgot' && (
            <Field label="Email Address" icon={Mail} htmlFor="au-email2">
              <input id="au-email2" type="email" required autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
            </Field>
          )}
          {step !== 'forgot' && codeInput}
          {step === 'reset' && (
            <>
              <Field label="New Password" icon={Lock} htmlFor="au-npw" hint="at least 8 characters">
                <div className="relative">
                  <input id="au-npw" type={show ? 'text' : 'password'} required className={`${inputCls} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#8E9AA7] cursor-pointer">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm New Password" icon={Lock} htmlFor="au-npw2">
                <input id="au-npw2" type={show ? 'text' : 'password'} required className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </Field>
            </>
          )}
          <ErrorNote text={err} />
          <button type="submit" disabled={busy} className={`${btn.mint} w-full h-12`}>
            {busy ? 'Please wait…' : step === 'verify' ? 'Confirm & continue' : step === 'forgot' ? 'Send code' : 'Save new password'}
          </button>
          {step !== 'forgot' && resendRow}
          {step === 'verify' && <p className="text-center text-[11px] text-[#8E9AA7]">Wrong email? <button type="button" onClick={() => { setStep(null); setMode('signup'); setErr(null); }} className="font-bold text-[#53E6D4] underline cursor-pointer">Go back</button></p>}
        </form>
      </div>
    );
  }

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
        {mode === 'login' && (
          <p className="-mt-2 text-right"><button type="button" onClick={() => { setStep('forgot'); setErr(null); }} className="text-[12px] font-bold text-[#53E6D4] underline cursor-pointer">Forgot password?</button></p>
        )}
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
