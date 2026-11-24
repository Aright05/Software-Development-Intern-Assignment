import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  Send,
  ExternalLink,
  Layers,
  Activity,
  ShieldCheck,
  Server,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Emails Hub', path: '/jobs', icon: CalendarClock },
  { name: 'Senders & SMTP', path: '/senders', icon: Send },
];

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const bullBoardUrl = import.meta.env.VITE_BULL_BOARD_URL || 'http://localhost:5000/admin/queues';

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full p-4">
      {/* Top Links */}
      <div className="space-y-6">
        <div>
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Main Navigation
          </div>
          <div className="space-y-1 mt-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Monitoring & Admin */}
        <div>
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Infrastructure & Queues
          </div>
          <div className="space-y-1 mt-1">
            <a
              href={bullBoardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition group"
            >
              <div className="flex items-center space-x-3">
                <Activity className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span>Bull Board</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition" />
            </a>

            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-slate-500 bg-slate-50 border border-slate-200/60 mt-2">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-slate-700">BullMQ Active</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">v5.40</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Architecture Specs Card */}
      <div className="pt-4 border-t border-slate-200/80">
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-300 mb-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Distributed Core</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Atomic Redis Lua rate limiting, PostgreSQL transactions & Elasticsearch search engine.
          </p>
          <div className="mt-3 pt-2.5 border-t border-indigo-900/60 flex items-center justify-between text-[10px] text-indigo-300">
            <span className="flex items-center space-x-1">
              <Server className="w-3 h-3" />
              <span>5 Concurrency</span>
            </span>
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Idempotent</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="w-64 bg-white/80 backdrop-blur-sm border-r border-slate-200/80 min-h-[calc(100vh-4rem)] hidden md:block flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Drawer panel */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
