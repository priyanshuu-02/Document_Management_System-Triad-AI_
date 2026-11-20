import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { motion } from 'framer-motion';
import { 
  Search, 
  Inbox, 
  Users, 
  Layers, 
  ShieldCheck, 
  Settings, 
  LogOut,
  ChevronRight,
  FolderOpen
} from 'lucide-react';

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
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
      } catch (err) {}
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name) => {
    if (!name) return 'US';
    return name.substring(0, 2).toUpperCase();
  };

  const currentTab = new URLSearchParams(location.search).get('tab') || 'users';

  const mainLinks = [
    { name: 'Document Hub', path: '/dashboard', icon: FolderOpen },
    { name: 'Advanced Search', path: '/search', icon: Search },
    { name: 'Access Requests', path: '/requests', icon: Inbox, badge: pendingCount },
  ];

  const adminLinks = [
    { name: 'User Management', path: '/admin?tab=users', tab: 'users', icon: Users },
    { name: 'Metadata Schema', path: '/admin?tab=metadata', tab: 'metadata', icon: Layers },
    { name: 'Audit Trail', path: '/admin?tab=audit', tab: 'audit', icon: ShieldCheck },
    { name: 'Settings', path: '/admin?tab=metadata', tab: 'metadata', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64
        bg-white dark:bg-[#121721] border-r border-slate-200/90 dark:border-[#1e2636]
        flex flex-col justify-between select-none transition-all duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        
        {/* Top Section: Logo & Navigation */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          
          {/* Logo Brand Header with generous top padding to prevent overflow */}
          <div className="pt-7 pb-5 px-6 flex items-center justify-between border-b border-slate-100 dark:border-[#1a2230]">
            <motion.div 
              whileHover={{ scale: 1.04 }}
              className="flex items-center space-x-3 cursor-pointer"
              onClick={() => navigate('/dashboard')}
            >
              {/* Sleek Modern Geometric Prism Logo matching mockup */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0e6245] to-[#14b8a6] text-white shadow-md shadow-emerald-900/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L2 20h20L12 2zm0 4.5l6.5 11.5H5.5L12 6.5z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white leading-none">
                  DMS
                </span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 tracking-wider mt-1 uppercase">
                  Workspace
                </span>
              </div>
            </motion.div>
          </div>

          {/* Navigation Items */}
          <div className="px-3.5 py-4 space-y-6">
            
            {/* Core Pages */}
            <div className="space-y-1">
              {mainLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <NavLink
                    key={link.name}
                    to={link.path}
                    onClick={onCloseMobile}
                    className="block relative"
                  >
                    <motion.div
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      className={`
                        group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150
                        ${isActive 
                          ? 'bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs' 
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-[#161d2a]'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-2.5">
                        {isActive && (
                          <div className="w-1 h-4 bg-[#0e6245] dark:bg-emerald-400 rounded-full shrink-0" />
                        )}
                        <Icon className={`w-4 h-4 transition-colors ${
                          isActive 
                            ? 'text-[#0e6245] dark:text-emerald-400' 
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                        }`} />
                        <span>{link.name}</span>
                      </div>

                      {link.badge > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0e6245] dark:bg-emerald-500 text-white shadow-2xs">
                          {link.badge}
                        </span>
                      )}
                    </motion.div>
                  </NavLink>
                );
              })}
            </div>

            {/* Administration Section */}
            {user?.role === 'admin' && (
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-[#1a2230]">
                <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                  Administration
                </div>

                {adminLinks.map((link) => {
                  const Icon = link.icon;
                  const isAdminPath = location.pathname === '/admin';
                  const isActive = isAdminPath && currentTab === link.tab;

                  return (
                    <NavLink
                      key={link.name}
                      to={link.path}
                      onClick={onCloseMobile}
                      className="block relative"
                    >
                      <motion.div
                        whileHover={{ x: 3 }}
                        whileTap={{ scale: 0.98 }}
                        className={`
                          group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150
                          ${isActive 
                            ? 'bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs' 
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-[#161d2a]'
                          }
                        `}
                      >
                        <div className="flex items-center space-x-2.5">
                          {isActive && (
                            <div className="w-1 h-3.5 bg-[#0e6245] dark:bg-emerald-400 rounded-full shrink-0" />
                          )}
                          <Icon className={`w-4 h-4 transition-colors ${
                            isActive 
                              ? 'text-[#0e6245] dark:text-emerald-400' 
                              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                          }`} />
                          <span>{link.name}</span>
                        </div>
                      </motion.div>
                    </NavLink>
                  );
                })}
              </div>
            )}

          </div>
        </div>

        {/* Bottom Section: Mountain Silhouette & User Profile Card */}
        <div className="relative pt-6 pb-4 px-3.5 border-t border-slate-100 dark:border-[#1a2230]">
          
          {/* Subtle Aesthetic Mountain Silhouette Graphic Backdrop */}
          <div className="absolute inset-x-0 bottom-0 top-0 overflow-hidden pointer-events-none opacity-20 dark:opacity-15">
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="w-full h-full text-emerald-600 dark:text-emerald-500 fill-current">
              <path d="M0 120 L0 80 Q60 50 120 75 T240 65 Q270 70 300 85 L300 120 Z" opacity="0.3" />
              <path d="M0 120 L0 90 Q80 60 160 85 T300 70 L300 120 Z" opacity="0.5" />
              <path d="M0 120 L0 100 Q90 85 180 100 T300 95 L300 120 Z" opacity="0.7" />
            </svg>
          </div>

          {/* User Profile Card */}
          <div className="relative z-10 flex items-center justify-between p-2 rounded-xl bg-slate-50/90 dark:bg-[#161d2a]/90 border border-slate-200/70 dark:border-[#222d3e]">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#0e6245] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                {getInitials(user?.username)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs truncate">
                  {user?.username || 'User'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {user?.division || 'Division'} • {user?.role === 'admin' ? 'Admin' : 'Member'}
                </div>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/60 dark:hover:bg-[#1f2838] rounded-lg transition-colors ml-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </motion.button>
          </div>

        </div>

      </aside>
    </>
  );
}
