import React, { useState, useRef, useEffect } from 'react';
import {
  Mail,
  ExternalLink,
  Activity,
  Plus,
  LogOut,
  ChevronDown,
  Menu,
  X,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';
import { User, SlackStatus } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';

interface NavbarProps {
  user: User | null;
  slackStatus: SlackStatus | null;
  onComposeClick: () => void;
  onLogout: () => void;
  onLoginClick: () => void;
  onToggleMobileSidebar: () => void;
  isMobileSidebarOpen: boolean;
  onSlackStatusChange?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  slackStatus,
  onComposeClick,
  onLogout,
  onLoginClick,
  onToggleMobileSidebar,
  isMobileSidebarOpen,
  onSlackStatusChange,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [slackConnecting, setSlackConnecting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const bullBoardUrl = import.meta.env.VITE_BULL_BOARD_URL || 'http://localhost:5000/admin/queues';

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSlackConnect = () => {
    setSlackConnecting(true);
    window.location.href = api.slack.getConnectUrl();
  };

  const handleSlackDisconnect = async () => {
    try {
      await api.slack.disconnect();
      showToast({
        type: 'info',
        title: 'Slack Disconnected',
        message: 'Your Slack workspace has been disconnected.',
      });
      if (onSlackStatusChange) onSlackStatusChange();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to disconnect Slack',
      });
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Mobile hamburger & Logo */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onToggleMobileSidebar}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
            aria-label="Toggle Navigation"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                  ReachInbox
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200/60 uppercase">
                  Scheduler
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 hidden sm:block">
                Production Full-Stack Job Engine
              </p>
            </div>
          </div>
        </div>

        {/* Right: Actions, Slack, Compose, Bull Board & User Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Slack Integration Button */}
          {slackStatus?.connected ? (
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold shadow-sm">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="truncate max-w-[110px]">{slackStatus.teamName || 'Slack'}</span>
              <button
                onClick={handleSlackDisconnect}
                className="ml-1 text-slate-400 hover:text-rose-600 transition"
                title="Disconnect Slack"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSlackConnect}
              disabled={slackConnecting}
              className="hidden lg:flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition shadow-sm"
              title="Connect Slack for rate limit alerts"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#E01E5A]" />
              <span>Connect Slack</span>
            </button>
          )}

          {/* Bull Board link */}
          <a
            href={bullBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-100/80 hover:bg-indigo-50 px-3 py-2 rounded-xl transition border border-slate-200/80"
            title="Real-time Bull Board queue dashboard"
          >
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold">Bull Board</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>

          {/* Prominent Compose New Email Button */}
          <button
            onClick={onComposeClick}
            className="inline-flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs sm:text-sm font-semibold shadow-md shadow-indigo-300/40 hover:shadow-indigo-300/60 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span>Compose Email</span>
          </button>

          {/* User Profile or Google Sign-In */}
          {user ? (
            <div className="relative ml-1" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center space-x-2 p-1.5 rounded-xl hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || user.email}
                    className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-200">
                    {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:block text-left text-xs">
                  <p className="font-semibold text-slate-800 leading-tight truncate max-w-[120px]">
                    {user.name || 'User'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
              </button>

              {/* Profile Dropdown */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900">{user.name || 'ReachInbox User'}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p>
                    <div className="mt-2 inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Google OAuth Verified
                    </div>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-sm ml-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="hidden sm:inline">Sign in with Google</span>
              <span className="sm:hidden">Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
