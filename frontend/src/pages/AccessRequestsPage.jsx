// Page 4: access requests. 'Incoming' shows requests for my division's documents,
// which I can approve or reject. 'Sent' shows the requests I made to other divisions.
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAccessRequests } from '../api/accessRequestsStore';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Inbox, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  RefreshCw,
  Building2, 
  User, 
  AlertCircle,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';

// Faster updates while reviewing requests; the rest of the app polls every 15 s.
const REQUESTS_PAGE_POLL_MS = 5000;
const MIN_REFRESH_SPIN_MS = 600;

export default function AccessRequestsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const highlightId = searchParams.get('highlight');

  const [activeTab, setActiveTab] = useState(urlTab === 'sent' ? 'sent' : 'incoming'); // 'incoming' or 'sent'
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    if (urlTab === 'sent' || urlTab === 'incoming') {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  // Shared store; while this page is open the app-wide poller runs every 5 s.
  const { inbox: incomingRequests, sent: sentRequests, loaded, refresh } =
    useAccessRequests(user?.id, REQUESTS_PAGE_POLL_MS);
  const loading = !loaded;

  const fetchRequests = async () => {
    const startedAt = Date.now();
    try {
      await refresh();
    } finally {
      // Keep the spinner visible briefly so a fast refresh still gives feedback.
      const remaining = Math.max(0, MIN_REFRESH_SPIN_MS - (Date.now() - startedAt));
      setTimeout(() => setRefreshing(false), remaining);
    }
  };

  // Pick a sensible tab once the data arrives (unless the URL already chose one):
  // with no incoming requests but some sent ones, open the Sent tab.
  const tabChosen = useRef(urlTab === 'sent' || urlTab === 'incoming');
  useEffect(() => {
    if (!loaded || tabChosen.current) return;
    tabChosen.current = true;
    if (incomingRequests.length === 0 && sentRequests.length > 0) {
      setActiveTab('sent');
    }
  }, [loaded, incomingRequests, sentRequests]);

  const handleApprove = async (requestId, docName) => {
    try {
      const note = window.prompt('Optional approval note (click OK to confirm approval):', '');
      if (note === null) return; // User cancelled
      await client.post('/access/approve', { request_id: requestId, note: note.trim() || undefined });
      setActionMessage({ type: 'success', text: `Approved access for "${docName}"` });
      fetchRequests(true);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to approve request.' 
      });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleReject = async (requestId, docName) => {
    try {
      const note = window.prompt('Optional rejection reason (click OK to confirm rejection):', '');
      if (note === null) return; // User cancelled
      await client.post('/access/reject', { request_id: requestId, note: note.trim() || undefined });
      setActionMessage({ type: 'success', text: `Rejected access for "${docName}"` });
      fetchRequests(true);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to reject request.' 
      });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleRevoke = async (requestId, docName) => {
    try {
      const note = window.prompt('Optional revocation reason (click OK to confirm revocation):', '');
      if (note === null) return; // User cancelled
      await client.post('/access/revoke', { request_id: requestId, note: note.trim() || undefined });
      setActionMessage({ type: 'success', text: `Revoked access for "${docName}"` });
      fetchRequests(true);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.error || 'Failed to revoke access.' });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const currentList = activeTab === 'incoming' ? incomingRequests : sentRequests;
  const filteredList = currentList.filter(req => {
    if (statusFilter === 'all') return true;
    return req.status === statusFilter;
  });

  const pendingIncomingCount = incomingRequests.filter(r => r.status === 'pending').length;
  const pendingSentCount = sentRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-3.5 pb-8 space-y-5">
      
      {/* Page title, with the Incoming / Sent tabs underneath */}
      <div className="space-y-4 pb-5 border-b border-slate-200/80 dark:border-[#1e2636]">
        <div className="pr-0 sm:pr-72 md:pr-80">
          <div className="flex items-center space-x-2.5">
            <div className="w-1.5 h-6 bg-[#0e6245] dark:bg-emerald-400 rounded-full" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Access Requests Inbox
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review cross-division document access requests and manage approvals in real-time.
          </p>
        </div>

        {/* Sub-navbar: Incoming & Sent Tabs with Refresh Button Beside */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 dark:bg-[#121721]/90 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-[#222d3e] w-fit shadow-xs">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('incoming')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'incoming' 
                  ? 'bg-white dark:bg-[#161d2a] text-[#065f46] dark:text-emerald-300 shadow-2xs font-bold' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-[#0e6245] dark:text-emerald-400" />
              <span>Incoming for My Division</span>
              {pendingIncomingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] animate-pulse">
                  {pendingIncomingCount}
                </span>
              )}
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab('sent')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sent' 
                  ? 'bg-white dark:bg-[#161d2a] text-[#065f46] dark:text-emerald-300 shadow-2xs font-bold' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-[#0e6245] dark:text-emerald-400" />
              <span>My Sent Requests</span>
              {pendingSentCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-[#0e6245] text-white text-[10px]">
                  {pendingSentCount}
                </span>
              )}
            </motion.button>
          </div>

          {/* Reload / Refresh Button placed directly beside the tabs */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setRefreshing(true);
              fetchRequests(false);
            }}
            title="Refresh access requests"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-emerald-400 bg-slate-100/90 dark:bg-[#121721]/90 hover:bg-slate-200/80 dark:hover:bg-[#161d2a] rounded-xl border border-slate-200/80 dark:border-[#222d3e] shadow-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#0e6245] dark:text-emerald-400' : ''}`} />
          </motion.button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div className={`flex items-center space-x-2 p-3.5 rounded-xl border text-sm transition-all ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300' 
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
        }`}>
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Filter Chips */}
      <div className="flex items-center space-x-2">
        {['all', 'pending', 'approved', 'rejected', 'revoked'].map((st) => (
          <motion.button
            key={st}
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === st 
                ? 'bg-[#0e6245] text-white font-bold shadow-2xs' 
                : 'bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#121721]'
            }`}
          >
            {st}
          </motion.button>
        ))}
      </div>

      {/* Requests Table / Cards */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e]">
          <div className="w-8 h-8 border-3 border-[#0e6245] dark:border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading requests...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-12 text-center shadow-2xs transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#121721] text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">No requests found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {activeTab === 'incoming' 
              ? 'No cross-division requests currently pending for your division.' 
              : 'You have not submitted any cross-division access requests yet.'}
          </p>
        </motion.div>
      ) : (
        <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-2xs overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#121721]/80 border-b border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-3.5">Document</th>
                  <th className="px-6 py-3.5">Target Division</th>
                  <th className="px-6 py-3.5">Requester</th>
                  <th className="px-6 py-3.5">Status & Decision Notes</th>
                  <th className="px-6 py-3.5">Requested At</th>
                  {activeTab === 'incoming' && (
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e2636]">
                {filteredList.map((req, idx) => {
                  const isHighlighted = highlightId && (req.id === highlightId || req._id === highlightId);
                  return (
                    <motion.tr 
                      key={req.id} 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className={`transition-colors ${
                        isHighlighted 
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-xl' 
                          : 'hover:bg-slate-50/60 dark:hover:bg-[#1a2332]/50'
                      }`}
                    >
                    
                    {/* Document */}
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-[#0e6245] dark:text-emerald-400 shrink-0" />
                      <span className="truncate max-w-xs">{req.doc_filename || 'Document'}</span>
                    </td>

                    {/* Target Division */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                        {req.doc_division}
                      </span>
                    </td>

                    {/* Requester */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{req.requested_by_username}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{req.requester_division}</span>
                      </div>
                    </td>

                    {/* Status Badge & Decision Notes */}
                    <td className="px-6 py-4">
                      <div className="space-y-1.5">
                        {/* Status Chip */}
                        <div>
                          {req.status === 'approved' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle className="w-3 h-3" />
                              <span>Approved</span>
                            </span>
                          )}
                          {req.status === 'pending' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <Clock className="w-3 h-3" />
                              <span>Pending Review</span>
                            </span>
                          )}
                          {req.status === 'rejected' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <XCircle className="w-3 h-3" />
                              <span>Rejected</span>
                            </span>
                          )}
                          {req.status === 'revoked' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              <XCircle className="w-3 h-3" />
                              <span>Revoked</span>
                            </span>
                          )}
                        </div>

                        {/* Reviewer line */}
                        {req.reviewed_by && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Reviewed by <span className="font-medium text-slate-700 dark:text-slate-300">{req.reviewed_by}</span>
                          </div>
                        )}

                        {/* Review Note Display */}
                        {req.review_note && (
                          <div className="flex items-start space-x-1.5 text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg px-2.5 py-1.5 max-w-sm">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#0e6245] dark:text-emerald-400" />
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">Note: </span>
                              <span className="italic">"{req.review_note}"</span>
                            </div>
                          </div>
                        )}

                        {/* Revoked line & Revocation Note */}
                        {req.status === 'revoked' && (
                          <div className="space-y-1">
                            {req.revoked_by && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-400">
                                Revoked by <span className="font-medium">{req.revoked_by}</span>
                              </div>
                            )}
                            {req.revocation_note && (
                              <div className="flex items-start space-x-1.5 text-[11px] text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg px-2.5 py-1.5 max-w-sm">
                                <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                                <div>
                                  <span className="font-semibold">Revocation Reason: </span>
                                  <span className="italic">"{req.revocation_note}"</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Requested At */}
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>

                    {/* Actions (Only on Incoming Tab) */}
                    {activeTab === 'incoming' && (
                      <td className="px-6 py-4 text-right">
                        {req.status === 'pending' ? (
                          <div className="flex items-center justify-end space-x-2">
                            <motion.button
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleApprove(req.id, req.doc_filename)}
                              className="px-3 py-1 bg-[#0e6245] hover:bg-[#0a4833] text-white rounded-lg font-bold transition-colors shadow-sm shadow-emerald-950/20"
                            >
                              Approve
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleReject(req.id, req.doc_filename)}
                              className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold transition-colors shadow-sm shadow-rose-500/20"
                            >
                              Reject
                            </motion.button>
                          </div>
                        ) : req.status === 'approved' && user?.role === 'admin' ? (
                          <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleRevoke(req.id, req.doc_filename)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold transition-colors"
                          >
                            Revoke
                          </motion.button>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                            {req.status === 'revoked' ? `Revoked by ${req.revoked_by || 'Admin'}` : `Reviewed by ${req.reviewed_by || 'Admin'}`}
                          </span>
                        )}
                      </td>
                    )}

                  </motion.tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
