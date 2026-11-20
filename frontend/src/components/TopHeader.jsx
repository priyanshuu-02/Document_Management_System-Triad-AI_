import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAccessRequests } from '../api/accessRequestsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Sun, 
  Moon, 
  Menu,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Check,
  FileText,
  Shield
} from 'lucide-react';

export default function TopHeader({ onOpenMobile }) {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Notification state
  const [isOpen, setIsOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'decisions' | 'requests'
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dms_read_notifications') || '[]');
    } catch {
      return [];
    }
  });

  const popoverRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Access requests come from the shared store (one poller for the whole app)
  const {
    inbox,
    sent,
    loading: loadingNotifs,
    refresh: fetchNotifications,
  } = useAccessRequests(user?.id);

  // Synthesize notifications from the shared request lists
  const notifications = useMemo(() => {
      const notifs = [];

      // 1. Process Sent Requests (Approvals, Rejections, Revocations)
      sent.forEach((req) => {
        if (req.status === 'approved') {
          notifs.push({
            id: `approved-${req.id}`,
            reqId: req.id,
            type: 'approved',
            category: 'decisions',
            title: 'Access Approved',
            message: `Your access to "${req.doc_filename}" was approved by ${req.reviewed_by || 'Reviewer'}.`,
            note: req.review_note,
            docId: req.doc_id,
            timestamp: req.reviewed_at || req.created_at,
            targetUrl: `/documents/${req.doc_id}`
          });
        } else if (req.status === 'rejected') {
          notifs.push({
            id: `rejected-${req.id}`,
            reqId: req.id,
            type: 'rejected',
            category: 'decisions',
            title: 'Access Rejected',
            message: `Your request for "${req.doc_filename}" was rejected by ${req.reviewed_by || 'Reviewer'}.`,
            note: req.review_note,
            docId: req.doc_id,
            timestamp: req.reviewed_at || req.created_at,
            targetUrl: `/requests?tab=sent&highlight=${req.id}`
          });
        } else if (req.status === 'revoked') {
          notifs.push({
            id: `revoked-${req.id}`,
            reqId: req.id,
            type: 'revoked',
            category: 'decisions',
            title: 'Access Revoked',
            message: `Your access to "${req.doc_filename}" was revoked by ${req.revoked_by || 'Administrator'}.`,
            note: req.revocation_note,
            docId: req.doc_id,
            timestamp: req.revoked_at || req.created_at,
            targetUrl: `/requests?tab=sent&highlight=${req.id}`
          });
        }
      });

      // 2. Process Incoming Requests (Pending review for division members or admins)
      inbox.forEach((req) => {
        if (req.status === 'pending') {
          notifs.push({
            id: `incoming-${req.id}`,
            reqId: req.id,
            type: 'incoming',
            category: 'requests',
            title: 'New Access Request',
            message: `${req.requested_by_username} (${req.requester_division}) requested access to "${req.doc_filename}".`,
            docId: req.doc_id,
            timestamp: req.created_at,
            targetUrl: `/requests?tab=incoming&highlight=${req.id}`
          });
        } else if (user?.role === 'admin') {
          // Admins also see recent decisions across the platform
          notifs.push({
            id: `admin-${req.id}-${req.status}`,
            reqId: req.id,
            type: req.status,
            category: 'decisions',
            title: `Request ${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`,
            message: `Request for "${req.doc_filename}" by ${req.requested_by_username} was ${req.status}.`,
            note: req.review_note || req.revocation_note,
            docId: req.doc_id,
            timestamp: req.reviewed_at || req.revoked_at || req.created_at,
            targetUrl: `/requests?tab=incoming&highlight=${req.id}`
          });
        }
      });

      // Sort newest first
      notifs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      return notifs;
  }, [inbox, sent, user?.role]);

  // Unread calculation
  const unreadCount = notifications.filter(n => !readIds.includes(n.id)).length;

  const markAsRead = (id) => {
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      localStorage.setItem('dms_read_notifications', JSON.stringify(updated));
    }
  };

  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
    localStorage.setItem('dms_read_notifications', JSON.stringify(allIds));
  };

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id);
    setIsOpen(false);
    navigate(notif.targetUrl);
  };

  const getInitials = (name) => {
    if (!name) return 'US';
    return name.substring(0, 2).toUpperCase();
  };

  const formatRelativeTime = (timeStr) => {
    if (!timeStr) return 'Recently';
    try {
      const diff = Math.floor((new Date() - new Date(timeStr)) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return 'Recently';
    }
  };

  // Filtered notifications
  const displayedNotifications = notifications.filter(n => {
    if (filterTab === 'decisions') return n.category === 'decisions';
    if (filterTab === 'requests') return n.category === 'requests';
    return true;
  });

  return (
    <header className="sticky top-0 z-30 pointer-events-none px-4 sm:px-6 lg:px-8 pt-3 pb-1 sm:pt-3.5 -mb-14 sm:-mb-16 transition-all">
      <div className="w-full flex items-center justify-between gap-4">
        
        {/* Left: Mobile menu toggle (floating pill on mobile viewports) */}
        <div className="pointer-events-auto md:hidden">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenMobile}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white backdrop-blur-2xl backdrop-saturate-150 bg-white/40 hover:bg-white/60 dark:bg-[#121721]/45 dark:hover:bg-[#161d2a]/60 border border-white/70 dark:border-white/12 rounded-2xl shadow-sm hover:shadow transition-all"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Desktop spacer to push floating nav to the right */}
        <div className="hidden md:block" />

        {/* Right: Floating Translucent Mirror Nav Bar */}
        <div 
          ref={popoverRef}
          className="pointer-events-auto relative flex items-center space-x-2 sm:space-x-2.5 px-3 py-1.5 backdrop-blur-2xl backdrop-saturate-150 bg-white/40 hover:bg-white/55 dark:bg-[#121721]/45 dark:hover:bg-[#161d2a]/60 border border-white/70 dark:border-white/12 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] rounded-2xl transition-all"
        >
          
          {/* Notifications Bell Button */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.05, rotate: [0, -10, 10, -5, 5, 0] }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                setIsOpen(!isOpen);
                if (!isOpen) fetchNotifications();
              }}
              title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
              className={`relative p-2 rounded-xl transition-all ${
                isOpen 
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-[#0e6245] dark:text-emerald-400' 
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center animate-pulse shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </motion.button>
          </div>

          {/* Translucent Mirror Divider */}
          <div className="w-px h-5 bg-slate-300/50 dark:bg-white/10 shrink-0" />

          {/* Theme Toggle Button */}
          <motion.button
            whileTap={{ rotate: 180, scale: 0.9 }}
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-amber-300 hover:bg-white/50 dark:hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </motion.button>

          {/* Translucent Mirror Divider */}
          <div className="w-px h-5 bg-slate-300/50 dark:bg-white/10 shrink-0" />

          {/* User Profile Chip */}
          <div className="flex items-center space-x-2.5 pl-0.5 pr-1">
            <div className="w-8 h-8 rounded-full bg-[#0e6245] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm shadow-emerald-950/20 ring-2 ring-emerald-500/20">
              {getInitials(user?.username)}
            </div>
            <div className="text-left text-xs leading-tight hidden sm:block">
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                {user?.username || 'User'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {user?.division} • {user?.role === 'admin' ? 'Admin' : 'Member'}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* NOTIFICATION CENTER DROPDOWN POPOVER */}
          {/* ========================================================================= */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
                className="absolute right-0 top-14 w-84 sm:w-96 backdrop-blur-2xl bg-white/95 dark:bg-[#161d2a]/95 rounded-2xl border border-slate-200/90 dark:border-[#222d3e] shadow-2xl overflow-hidden z-50 text-xs"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-[#1e2636] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-[#065f46] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[11px] text-[#0e6245] dark:text-emerald-400 hover:underline font-medium flex items-center space-x-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Mark all as read</span>
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#1e2636] flex items-center space-x-1 bg-slate-50/70 dark:bg-[#121721] text-[11px]">
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      filterTab === 'all'
                        ? 'bg-white dark:bg-[#1e2636] text-[#065f46] dark:text-emerald-300 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    onClick={() => setFilterTab('decisions')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      filterTab === 'decisions'
                        ? 'bg-white dark:bg-[#1e2636] text-[#065f46] dark:text-emerald-300 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                  >
                    Decisions
                  </button>
                  <button
                    onClick={() => setFilterTab('requests')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      filterTab === 'requests'
                        ? 'bg-white dark:bg-[#1e2636] text-[#065f46] dark:text-emerald-300 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                  >
                    Requests
                  </button>
                </div>

                {/* Notifications Scroll List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1e2636]">
                  {loadingNotifs && notifications.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 dark:text-slate-500">
                      Loading updates...
                    </div>
                  ) : displayedNotifications.length === 0 ? (
                    <div className="py-10 px-4 text-center">
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#1e2636] text-slate-400 flex items-center justify-center mx-auto mb-2">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs">No notifications</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        You're all caught up on document access updates.
                      </div>
                    </div>
                  ) : (
                    displayedNotifications.map((n) => {
                      const isUnread = !readIds.includes(n.id);

                      return (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3.5 hover:bg-slate-50/80 dark:hover:bg-[#1a2332] cursor-pointer transition-colors flex items-start space-x-3 ${
                            isUnread ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          {/* Type Icon */}
                          <div className="shrink-0 mt-0.5">
                            {n.type === 'approved' && (
                              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                <CheckCircle className="w-4 h-4" />
                              </div>
                            )}
                            {n.type === 'rejected' && (
                              <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                                <XCircle className="w-4 h-4" />
                              </div>
                            )}
                            {n.type === 'revoked' && (
                              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                <AlertTriangle className="w-4 h-4" />
                              </div>
                            )}
                            {n.type === 'incoming' && (
                              <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                                <Clock className="w-4 h-4" />
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {n.title}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-400 shrink-0">
                                {formatRelativeTime(n.timestamp)}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                              {n.message}
                            </p>

                            {/* Note / Decision Reason Callout */}
                            {n.note && (
                              <div className="mt-1.5 p-1.5 rounded-md bg-slate-100/80 dark:bg-[#1f2838] border border-slate-200/60 dark:border-[#273347] text-[10px] text-slate-600 dark:text-slate-300 italic line-clamp-2">
                                <span className="font-semibold not-italic text-slate-700 dark:text-slate-200">
                                  {n.type === 'rejected' ? 'Reason: ' : n.type === 'revoked' ? 'Revocation Reason: ' : 'Note: '}
                                </span>
                                "{n.note}"
                              </div>
                            )}
                          </div>

                          {/* Unread dot */}
                          {isUnread && (
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0e6245] dark:bg-emerald-400 shrink-0 mt-2" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Link */}
                <div className="p-2.5 bg-slate-50 dark:bg-[#121721] border-t border-slate-100 dark:border-[#1e2636] text-center">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/requests');
                    }}
                    className="text-xs font-semibold text-[#0e6245] dark:text-emerald-400 hover:underline inline-flex items-center space-x-1"
                  >
                    <span>View All Access Requests Inbox</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>
    </header>
  );
}
