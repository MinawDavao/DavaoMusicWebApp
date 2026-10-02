import React, { useState } from 'react';
import { UserRole, ScreenType } from '../../types';
import { 
  Headphones, 
  Music, 
  Sparkles, 
  ArrowLeft, 
  ShieldCheck, 
  Check, 
  LogIn, 
  Copy, 
  Zap, 
  KeyRound, 
  Mail, 
  Eye, 
  EyeOff 
} from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (role: UserRole, customName?: string) => void;
  onNavigateToScreen: (screen: ScreenType) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginSuccess,
  onNavigateToScreen,
}) => {
  // Simple role choice: 'fan' or 'artist'
  const [selectedRole, setSelectedRole] = useState<UserRole>('fan');

  // Input states initialized with Fan sample credentials for instant usability
  const [email, setEmail] = useState('Fanuser@gmail.com');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedRole, setCopiedRole] = useState<'fan' | 'artist' | null>(null);

  // Switch to Fan sample credentials
  const handleSelectFan = () => {
    setSelectedRole('fan');
    setEmail('Fanuser@gmail.com');
    setPassword('123456');
    setErrorMessage(null);
  };

  // Switch to Artist sample credentials
  const handleSelectArtist = () => {
    setSelectedRole('artist');
    setEmail('Artistuser@gmail.com');
    setPassword('123456');
    setErrorMessage(null);
  };

  // Copy sample credentials to clipboard feedback
  const handleCopyCredentials = (role: 'fan' | 'artist') => {
    const credText = role === 'fan' 
      ? 'Email: Fanuser@gmail.com\nPassword: 123456'
      : 'Email: Artistuser@gmail.com\nPassword: 123456';
    navigator.clipboard?.writeText(credText);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
  };

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    // Check credentials or role selection
    if (cleanEmail === 'fanuser@gmail.com' && cleanPassword === '123456') {
      onLoginSuccess('fan', 'Fan User');
      onNavigateToScreen('fan');
      return;
    }

    if (cleanEmail === 'artistuser@gmail.com' && cleanPassword === '123456') {
      onLoginSuccess('artist', 'The Marfori Sound');
      onNavigateToScreen('artist');
      return;
    }

    // Flexible fallback: if user typed a custom email with password, log in according to selected role
    if (cleanPassword === '123456') {
      const name = selectedRole === 'artist' ? 'The Marfori Sound' : 'Fan User';
      onLoginSuccess(selectedRole, name);
      onNavigateToScreen(selectedRole === 'artist' ? 'artist' : 'fan');
    } else {
      setErrorMessage('Invalid password. Sample password is: 123456');
    }
  };

  return (
    <div className="min-h-screen py-6 px-3 sm:px-6 relative overflow-hidden bg-[#0F1417] pb-32 flex items-center justify-center">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-[#6045F4]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#53E6D4]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4">
        
        {/* Navigation back to common view */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigateToScreen('home')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
          <span className="text-[10px] text-slate-400 font-mono">Tugtog Davao Portal</span>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl bg-[#161B20] border border-white/10 p-5 sm:p-7 shadow-2xl space-y-5">
          
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/30 text-[#53E6D4] text-[10px] font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-[#53E6D4]" />
              Davao Soundstage Log In
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-extrabold text-white">
              Log In to Your Account
            </h1>
            <p className="text-xs text-[#8E9AA7]">
              Choose whether you are logging in as a Fan or an Artist
            </p>
          </div>

          {/* Simple Option: Login as Fan or Artist */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#0F1417] border border-white/10">
            <button
              type="button"
              onClick={handleSelectFan}
              id="auth-role-fan-btn"
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                selectedRole === 'fan'
                  ? 'bg-[#53E6D4] text-[#0F1417] shadow-[0_0_12px_rgba(83,230,212,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Headphones className="w-4 h-4" />
              <span>Log In as Fan</span>
            </button>

            <button
              type="button"
              onClick={handleSelectArtist}
              id="auth-role-artist-btn"
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                selectedRole === 'artist'
                  ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Log In as Artist</span>
            </button>
          </div>

          {/* Sample Login Credentials Box */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-[#0F1417] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-heading font-bold uppercase tracking-wider text-[#53E6D4] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#53E6D4]" />
                Sample Login Credentials
              </span>
              <span className="text-[10px] text-slate-400 font-mono">1-Click Auto Fill</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Fan Credential Card */}
              <div 
                onClick={handleSelectFan}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer text-left space-y-1 ${
                  selectedRole === 'fan'
                    ? 'bg-[#53E6D4]/10 border-[#53E6D4]/50 shadow-sm'
                    : 'bg-white/5 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-heading font-bold text-[#53E6D4] uppercase">
                    For Fan
                  </span>
                  {selectedRole === 'fan' && (
                    <span className="w-2 h-2 rounded-full bg-[#53E6D4] animate-pulse" />
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-200">
                  <span className="text-slate-400 block text-[9.5px]">Email:</span>
                  <span className="font-semibold block truncate">Fanuser@gmail.com</span>
                  <span className="text-slate-400 block text-[9.5px] mt-0.5">Password:</span>
                  <span className="font-semibold text-[#53E6D4] block">123456</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectFan();
                  }}
                  className="w-full mt-1 py-1 rounded-lg bg-[#53E6D4]/20 hover:bg-[#53E6D4] text-[#53E6D4] hover:text-[#0F1417] text-[10px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Use Fan Login</span>
                </button>
              </div>

              {/* Artist Credential Card */}
              <div 
                onClick={handleSelectArtist}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer text-left space-y-1 ${
                  selectedRole === 'artist'
                    ? 'bg-[#6045F4]/15 border-[#6045F4]/60 shadow-sm'
                    : 'bg-white/5 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-heading font-bold text-[#A78BFA] uppercase">
                    For Artist
                  </span>
                  {selectedRole === 'artist' && (
                    <span className="w-2 h-2 rounded-full bg-[#6045F4] animate-pulse" />
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-200">
                  <span className="text-slate-400 block text-[9.5px]">Email:</span>
                  <span className="font-semibold block truncate">Artistuser@gmail.com</span>
                  <span className="text-slate-400 block text-[9.5px] mt-0.5">Password:</span>
                  <span className="font-semibold text-[#A78BFA] block">123456</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectArtist();
                  }}
                  className="w-full mt-1 py-1 rounded-lg bg-[#6045F4]/20 hover:bg-[#6045F4] text-[#A78BFA] hover:text-white text-[10px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Use Artist Login</span>
                </button>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold animate-fadeIn">
                {errorMessage}
              </div>
            )}

            {/* Email Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-[#53E6D4]" />
                <span>Email Address</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={selectedRole === 'fan' ? 'Fanuser@gmail.com' : 'Artistuser@gmail.com'}
                required
                className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#53E6D4] transition-colors font-mono"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-[#A78BFA]" />
                  Password
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Sample: 123456</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full bg-[#0F1417] border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6045F4] transition-colors font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              id="auth-submit-btn"
              className={`w-full py-2.5 sm:py-3 rounded-xl font-heading font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95 ${
                selectedRole === 'fan'
                  ? 'bg-[#53E6D4] hover:bg-[#6dfae9] text-[#0F1417] shadow-[0_0_15px_rgba(83,230,212,0.4)]'
                  : 'bg-[#6045F4] hover:bg-[#7258FF] text-white shadow-[0_0_15px_rgba(96,69,244,0.4)]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>
                {selectedRole === 'fan' ? 'Log In as Fan' : 'Log In as Artist'}
              </span>
            </button>
          </form>

        </div>

      </div>
    </div>
  );
};
