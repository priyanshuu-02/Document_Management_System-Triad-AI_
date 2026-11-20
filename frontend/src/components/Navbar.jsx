import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import client from '../api/client';
import { 
  FileText, 
  Search, 
  Inbox, 
  Settings, 
  LogOut, 
  Building2, 
  Sun, 
  Moon
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchPending = async () => {
      try {
        const res = await client.get('/access/inbox');
        const pending = (res.data?.requests || []).filter(r => r.status === 'pending');
        setPendingCount(pending.length);
      } catch (err) {
        // Silently ignore if not authorized or network issue
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { name: 'Document Hub', path: '/dashboard', icon: FileText },
    { name: 'Advanced Search', path: '/search', icon: Search },
    { name: 'Access Requests', path: '/requests', icon: Inbox, badge: pendingCount },
    ...(user?.role === 'admin' ? [{ name: 'Admin Settings', path: '/admin', icon: Settings }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <Link to="/dashboard" className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm shadow-teal-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">TRIAD AI</span>
                <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  DMS
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>{link.name}</span>
                  {link.badge > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500 text-white animate-pulse">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-2.5">
            {/* Dark / Light Mode Toggle Button */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {user && (
              <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-1.5 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 flex items-center justify-center font-bold text-xs uppercase">
                  {user.username ? user.username.substring(0, 2) : 'US'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                    {user.username}
                  </div>
                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center font-medium text-teal-700 dark:text-teal-400">
                      <Building2 className="w-3 h-3 mr-0.5" />
                      {user.division}
                    </span>
                    {user.role === 'admin' && (
                      <span className="px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px] border border-indigo-200 dark:border-indigo-800/50">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors border border-transparent hover:border-rose-100 dark:hover:border-rose-900/40"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
