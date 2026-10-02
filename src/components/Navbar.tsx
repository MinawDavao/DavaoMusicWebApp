import React from 'react';
import { ScreenType, UserRole } from '../types';
import { 
  Home, 
  Headphones, 
  Radio, 
  Tag, 
  Music, 
  ShieldCheck,
  Sparkles,
  LogIn,
  LogOut
} from 'lucide-react';

interface NavbarProps {
  currentScreen: ScreenType;
  onSelectScreen: (screen: ScreenType) => void;
  activeRole: UserRole;
  onToggleRole: () => void;
  userName: string;
  userAvatar: string;
  isLoggedIn?: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  onSelectScreen,
  activeRole,
  onToggleRole,
  userName,
  userAvatar,
  isLoggedIn = false,
  onLogout,
}) => {
  // Line up options: Home, Audio, Connect, Deals as requested
  const mainNavItems = [
    { id: 'home' as ScreenType, label: 'Home', icon: Home },
    { id: 'audio' as ScreenType, label: 'Audio', icon: Headphones },
    { id: 'connect' as ScreenType, label: 'Connect', icon: Radio },
    { id: 'deals' as ScreenType, label: 'Deals', icon: Tag },
  ];

  // Helper to determine if item is active (mapping aliases)
  const isItemActive = (id: ScreenType) => {
    if (id === 'home' && currentScreen === 'home') return true;
    if (id === 'audio' && (currentScreen === 'audio' || currentScreen === 'artist')) return true;
    if (id === 'connect' && (currentScreen === 'connect' || currentScreen === 'fan')) return true;
    if (id === 'deals' && (currentScreen === 'deals' || currentScreen === 'marketplace')) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#EBEBED]/10 bg-[#0F1417]/95 backdrop-blur-xl transition-all shadow-md">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-5 pt-3 pb-2.5 space-y-2.5">
        
        {/* Row 1: Logo, Name, and Auth Actions (Log In button for guests; Profile & Mode when logged in) */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo and Name */}
          <button
            onClick={() => onSelectScreen('home')}
            className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none flex-shrink-0"
            id="brand-logo-btn"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6045F4] to-[#53E6D4] p-0.5 shadow-md shadow-[#6045F4]/30 group-hover:shadow-[#6045F4]/50 transition-all">
              <div className="w-full h-full bg-[#0F1417] rounded-[10px] flex items-center justify-center">
                <Music className="w-4 h-4 text-[#53E6D4] group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-extrabold text-base tracking-wider">
                <span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span>
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#53E6D4] animate-pulse" title="Live Stage Online" />
            </div>
          </button>

          {/* Right Header Section:
              - When NOT logged in (common view): remove toggle & profile icon, display "Log In"
              - When logged in: display Fan/Band badge toggle, profile avatar and log out option */}
          {!isLoggedIn ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => onSelectScreen('auth')}
                id="nav-login-btn"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#6045F4] to-[#7B61FF] hover:from-[#6D53FF] hover:to-[#8E77FF] text-white text-xs font-bold shadow-md shadow-[#6045F4]/30 hover:shadow-[#6045F4]/50 transition-all border border-white/15 cursor-pointer active:scale-95"
                title="Log In as Fan or Band"
              >
                <LogIn className="w-3.5 h-3.5 text-[#53E6D4]" />
                <span>Log In</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Static Role Label (whether Fan or Band - Toggle removed) */}
              <div 
                id="nav-role-label"
                className={`px-2.5 py-1 rounded-full text-[10px] font-heading font-extrabold tracking-wider uppercase border flex items-center gap-1.5 shadow-sm ${
                  activeRole === 'fan'
                    ? 'bg-[#53E6D4]/15 border-[#53E6D4]/30 text-[#53E6D4]'
                    : 'bg-[#6045F4]/20 border-[#6045F4]/40 text-[#A78BFA]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>{activeRole === 'fan' ? 'Fan' : 'Band'}</span>
              </div>

              {/* Profile Image Icon of the Logged-in User (Click to go to User Profile) */}
              <button 
                onClick={() => onSelectScreen(activeRole === 'artist' ? 'artist' : 'fan')}
                id="nav-user-profile-btn"
                className={`relative p-0.5 rounded-full transition-all cursor-pointer focus:outline-none ${
                  (currentScreen === 'fan' || currentScreen === 'artist')
                    ? 'ring-2 ring-[#53E6D4] shadow-[0_0_12px_rgba(83,230,212,0.5)]'
                    : 'border border-white/20 hover:border-[#53E6D4] hover:ring-2 hover:ring-[#53E6D4]/40'
                }`}
                title={`${userName} (Click to open your Profile)`}
              >
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-[#0F1417]"
                />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#53E6D4] ring-2 ring-[#0F1417]" />
              </button>

              {/* Logout Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  id="nav-logout-btn"
                  className="p-1.5 rounded-full bg-[#161B20] hover:bg-white/10 text-slate-400 hover:text-red-400 border border-white/10 transition-colors cursor-pointer"
                  title="Log Out to Common View"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Header Below the Logo and Name - Line up Home, Audio, Connect, Deals */}
        <nav 
          aria-label="Primary sections" 
          className="grid grid-cols-4 gap-1 sm:gap-2 bg-[#161B20] p-1 rounded-xl border border-white/10 shadow-inner"
        >
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onSelectScreen(item.id)}
                id={`nav-${item.id}`}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-1 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#6045F4] text-white shadow-[0_0_12px_rgba(96,69,244,0.5)] font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#53E6D4]' : 'text-slate-400'}`} />
                <span className="text-[11px] sm:text-xs truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

      </div>
    </header>
  );
};
