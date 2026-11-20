// Page 6: admin settings. Three tabs: users (roles and divisions), metadata
// fields (add or edit fields like "Report Type" and their options), and the
// audit log of access decisions.
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useMetadataFields, reloadMetadataFields } from '../api/metadataFields';
import { 
  Settings, 
  Plus, 
  Trash2, 
  Pencil,
  X,
  Tag, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Users,
  ShieldCheck,
  Shield,
  History,
  Building2,
  Search,
  UserPlus,
  RefreshCw,
  Filter,
  Calendar,
  RotateCcw
} from 'lucide-react';

export default function AdminSettingsPage() {
  const { user: currentUser } = useAuth();
  const { divisions: divisionOptions } = useMetadataFields();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'users'); // 'users' | 'metadata' | 'audit'

  useEffect(() => {
    if (urlTab && ['users', 'metadata', 'audit'].includes(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  // Users Management State
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'user' | 'admin'
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Metadata Fields State
  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('select');
  const [optionsStr, setOptionsStr] = useState('');
  const [required, setRequired] = useState(false);
  const [submittingField, setSubmittingField] = useState(false);

  // Audit Logs State & Filters
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditEventType, setAuditEventType] = useState('all');
  const [auditActorFilter, setAuditActorFilter] = useState('all');
  const [auditDateFilter, setAuditDateFilter] = useState('all');

  // General Notification
  const [message, setMessage] = useState(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await client.get('/admin/users');
      setUsers(res.data?.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to load registered users from backend.'
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchFields = async () => {
    setLoadingFields(true);
    try {
      const res = await client.get('/admin/metadata-fields');
      setFields(res.data?.fields || []);
      // Also refresh the shared copy, so filters and forms on other pages
      // pick up the admin's changes straight away.
      reloadMetadataFields();
    } catch (err) {
      console.error('Failed to load fields:', err);
    } finally {
      setLoadingFields(false);
    }
  };

  const fetchAuditEvents = async () => {
    setLoadingAudit(true);
    try {
      const res = await client.get('/admin/audit-events?limit=300');
      setAuditEvents(res.data?.events || []);
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'metadata') {
      fetchFields();
    } else if (activeTab === 'audit') {
      fetchAuditEvents();
    }
  }, [activeTab]);

  // Handle User Promotion / Demotion
  const handleUpdateRole = async (targetUser, targetRole) => {
    const actionName = targetRole === 'admin' ? 'promote' : 'demote';
    const confirmPrompt = targetRole === 'admin'
      ? `Are you sure you want to promote "${targetUser.username}" (${targetUser.email}) to Administrator?`
      : `Are you sure you want to remove Administrator rights from "${targetUser.username}"?`;

    if (!window.confirm(confirmPrompt)) return;

    setActionLoadingId(targetUser.id);
    setMessage(null);

    try {
      const res = await client.post(`/admin/users/${targetUser.id}/role`, {
        role: targetRole,
        note: `Role updated to ${targetRole} by admin ${currentUser?.username || ''}`
      });

      setMessage({
        type: 'success',
        text: res.data?.message || `Successfully updated role for ${targetUser.username}.`
      });
      fetchUsers();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || `Failed to ${actionName} user.`
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle User Division Transfer
  const handleUpdateDivision = async (targetUser, newDivision) => {
    if (!newDivision || newDivision === targetUser.division) return;
    if (!window.confirm(`Transfer user "${targetUser.username}" to ${newDivision}?`)) return;

    setActionLoadingId(targetUser.id);
    setMessage(null);

    try {
      const res = await client.post(`/admin/users/${targetUser.id}/division`, {
        division: newDivision,
        note: `Transferred to ${newDivision} by admin ${currentUser?.username || ''}`
      });

      setMessage({
        type: 'success',
        text: res.data?.message || `Successfully transferred ${targetUser.username} to ${newDivision}.`
      });
      fetchUsers();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to update user division.'
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Start Editing a Metadata Field
  const startEditingField = (field) => {
    setEditingFieldId(field.id);
    setName(field.name || '');
    setFieldType(field.field_type || 'select');
    setOptionsStr((field.options || []).join(', '));
    setRequired(Boolean(field.required));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditingField = () => {
    setEditingFieldId(null);
    setName('');
    setFieldType('select');
    setOptionsStr('');
    setRequired(false);
  };

  // Handle Add or Update Dynamic Metadata Field
  const handleAddField = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmittingField(true);
    setMessage(null);

    const options = fieldType === 'select'
      ? optionsStr.split(',').map(o => o.trim()).filter(Boolean)
      : [];

    try {
      if (editingFieldId) {
        // Update existing field via PUT
        const res = await client.put(`/admin/metadata-fields/${editingFieldId}`, {
          name: name.trim(),
          field_type: fieldType,
          options,
          required
        });
        setMessage({ type: 'success', text: res.data?.message || 'Metadata field updated successfully!' });
      } else {
        // Create new field via POST
        const res = await client.post('/admin/metadata-fields', {
          name: name.trim(),
          field_type: fieldType,
          options,
          required
        });
        setMessage({ type: 'success', text: res.data?.message || 'New metadata field added successfully!' });
      }

      cancelEditingField();
      fetchFields();
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to save dynamic metadata field.' 
      });
    } finally {
      setSubmittingField(false);
    }
  };

  // Handle Delete Dynamic Metadata Field
  const handleDeleteField = async (fieldId, fieldName) => {
    if (!window.confirm(`Are you sure you want to delete the field "${fieldName}"?`)) return;

    try {
      await client.delete(`/admin/metadata-fields/${fieldId}`);
      setMessage({ type: 'success', text: `Field "${fieldName}" deleted.` });
      fetchFields();
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to delete field.' 
      });
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!userSearchQuery) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.division || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });

  const standardUsersCount = users.filter(u => u.role === 'user').length;
  const adminUsersCount = users.filter(u => u.role === 'admin').length;

  // Filtered Audit Events
  const uniqueAuditActors = Array.from(new Set(auditEvents.map(e => e.actor_username).filter(Boolean))).sort();

  const auditTypeCounts = {
    all: auditEvents.length,
    access_requested: auditEvents.filter(e => e.event_type === 'access_requested').length,
    access_approved: auditEvents.filter(e => e.event_type === 'access_approved').length,
    access_rejected: auditEvents.filter(e => e.event_type === 'access_rejected').length,
    access_revoked: auditEvents.filter(e => e.event_type === 'access_revoked').length,
    user_role_updated: auditEvents.filter(e => e.event_type === 'user_role_updated').length,
    user_division_updated: auditEvents.filter(e => e.event_type === 'user_division_updated').length,
  };

  const filteredAuditEvents = auditEvents.filter(ev => {
    // 1. Event Type Filter
    if (auditEventType !== 'all' && ev.event_type !== auditEventType) {
      return false;
    }

    // 2. Actor Filter
    if (auditActorFilter !== 'all' && ev.actor_username !== auditActorFilter) {
      return false;
    }

    // 3. Date Range Filter
    if (auditDateFilter !== 'all' && ev.created_at) {
      const evDate = new Date(ev.created_at);
      const now = new Date();
      if (auditDateFilter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (evDate < startOfToday) return false;
      } else if (auditDateFilter === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (evDate < sevenDaysAgo) return false;
      } else if (auditDateFilter === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (evDate < thirtyDaysAgo) return false;
      }
    }

    // 4. Search Query
    if (auditSearchQuery) {
      const q = auditSearchQuery.toLowerCase();
      const matchActor = (ev.actor_username || '').toLowerCase().includes(q);
      const matchSubject = (ev.subject_username || '').toLowerCase().includes(q);
      const matchDoc = (ev.doc_filename || '').toLowerCase().includes(q);
      const matchNote = (ev.note || '').toLowerCase().includes(q);
      const matchType = (ev.event_type || '').toLowerCase().replace(/_/g, ' ').includes(q);
      const matchDivision = (ev.doc_division || ev.old_division || ev.new_division || '').toLowerCase().includes(q);
      if (!matchActor && !matchSubject && !matchDoc && !matchNote && !matchType && !matchDivision) {
        return false;
      }
    }

    return true;
  });

  const hasAuditFilters = Boolean(
    auditSearchQuery || 
    auditEventType !== 'all' || 
    auditActorFilter !== 'all' || 
    auditDateFilter !== 'all'
  );

  const resetAuditFilters = () => {
    setAuditSearchQuery('');
    setAuditEventType('all');
    setAuditActorFilter('all');
    setAuditDateFilter('all');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-3.5 pb-8 space-y-5"
    >
      
      {/* Page title and tabs */}
      <div className="space-y-4 pb-5 border-b border-slate-200/80 dark:border-[#222d3e]">
        <div className="pr-0 sm:pr-72 md:pr-80">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center">
            <span className="w-1.5 h-6 bg-[#0e6245] dark:bg-emerald-400 rounded-full mr-3 shrink-0"></span>
            <span>Admin Console</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 ml-4.5">
            Manage user roles, configure extensible metadata schemas, and review security audit trails.
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 dark:bg-[#161d2a]/90 backdrop-blur-md rounded-xl border border-slate-200/80 dark:border-[#222d3e] w-fit shadow-xs">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveTab('users'); setMessage(null); }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'users'
                ? 'bg-white dark:bg-[#0e6245] text-[#0e6245] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#1f2838]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#0e6245] dark:text-emerald-300" />
            <span>User Management</span>
            {users.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'users'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-[#0e6245] dark:text-emerald-200'
                  : 'bg-slate-200/70 dark:bg-[#222d3e] text-slate-600 dark:text-slate-400'
              }`}>
                {users.length}
              </span>
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveTab('metadata'); setMessage(null); }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'metadata'
                ? 'bg-white dark:bg-[#0e6245] text-[#0e6245] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#1f2838]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#0e6245] dark:text-emerald-300" />
            <span>Dynamic Metadata</span>
            {fields.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'metadata'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-[#0e6245] dark:text-emerald-200'
                  : 'bg-slate-200/70 dark:bg-[#222d3e] text-slate-600 dark:text-slate-400'
              }`}>
                {fields.length}
              </span>
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveTab('audit'); setMessage(null); }}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'audit'
                ? 'bg-white dark:bg-[#0e6245] text-[#0e6245] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-[#1f2838]'
            }`}
          >
            <History className="w-3.5 h-3.5 text-[#0e6245] dark:text-emerald-300" />
            <span>Audit Trail</span>
            {auditEvents.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'audit'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-[#0e6245] dark:text-emerald-200'
                  : 'bg-slate-200/70 dark:bg-[#222d3e] text-slate-600 dark:text-slate-400'
              }`}>
                {auditEvents.length}
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* Success / error message */}
      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center space-x-2 p-3.5 rounded-xl border text-sm transition-all ${
            message.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300' 
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </motion.div>
      )}

      {/* Tab 1: users (make admin, move division) */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          
          {/* Top search & summary */}
          <div className="bg-white dark:bg-[#161d2a] p-4 rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                  Registered Users & Privileges
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#c4e3de]/40 dark:bg-[#0e6245]/20 text-[#0e6245] dark:text-emerald-300 border border-[#c4e3de] dark:border-[#0e6245]/40">
                  {users.length} Users Total
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage user roles and privileges across all divisions. Self-selected admin registration is prohibited.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Role filter buttons */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-[#0d1117] p-0.5 text-xs border border-slate-200/60 dark:border-[#222d3e]">
                <button
                  type="button"
                  onClick={() => setRoleFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    roleFilter === 'all'
                      ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('user')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    roleFilter === 'user'
                      ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Standard Users ({standardUsersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('admin')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    roleFilter === 'admin'
                      ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Admins ({adminUsersCount})
                </button>
              </div>

              {/* Search bar & Refresh */}
              <div className="flex items-center space-x-1.5">
                <div className="relative w-full sm:w-60">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search username, email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  />
                </div>

                <button
                  onClick={fetchUsers}
                  title="Refresh users list"
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-[#222d3e] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin text-[#0e6245]' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm overflow-hidden transition-colors">
            {loadingUsers ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#0e6245] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading registered users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
                No users matching your query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#121721] border-b border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">User Details</th>
                      <th className="px-6 py-3.5">Division</th>
                      <th className="px-6 py-3.5">Assigned Role</th>
                      <th className="px-6 py-3.5">Joined Date</th>
                      <th className="px-6 py-3.5 text-right">Role Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222d3e]">
                    {filteredUsers.map((u, idx) => {
                      const isSelf = currentUser && (currentUser.id === u.id || currentUser.user_id === u.id);
                      const isAdmin = u.role === 'admin';
                      const isActing = actionLoadingId === u.id;

                      return (
                        <motion.tr 
                          key={u.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03, duration: 0.2 }}
                          className="hover:bg-slate-50/60 dark:hover:bg-[#1c2436] transition-colors"
                        >
                          
                          {/* User info */}
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs uppercase ${
                                isAdmin
                                  ? 'bg-[#c4e3de]/40 dark:bg-[#0e6245]/30 text-[#0e6245] dark:text-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}>
                                {u.username ? u.username.substring(0, 2) : 'US'}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                                  <span>{u.username}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-normal">
                                      (You)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Division (change it to move the user) */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                              <select
                                value={u.division}
                                onChange={(e) => handleUpdateDivision(u, e.target.value)}
                                disabled={isActing}
                                title="Change division to transfer user"
                                className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-800 dark:text-slate-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#0e6245] cursor-pointer disabled:opacity-50"
                              >
                                {/* Divisions are the options of the Division field (Metadata tab) */}
                                {[...new Set([...divisionOptions, u.division].filter(Boolean))].map(d => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Assigned Role */}
                          <td className="px-6 py-4">
                            {isAdmin ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#c4e3de]/40 dark:bg-[#0e6245]/20 text-[#0e6245] dark:text-emerald-300 border border-[#c4e3de] dark:border-[#0e6245]/40">
                                <ShieldCheck className="w-3 h-3 text-[#0e6245] dark:text-emerald-400" />
                                <span>Administrator</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                <span>Standard User</span>
                              </span>
                            )}
                          </td>

                          {/* Joined */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            {isAdmin ? (
                              isSelf ? (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                                  Current Session
                                </span>
                              ) : (
                                <motion.button
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => handleUpdateRole(u, 'user')}
                                  disabled={isActing}
                                  className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                                >
                                  {isActing ? 'Updating...' : 'Revoke Admin'}
                                </motion.button>
                              )
                            ) : (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleUpdateRole(u, 'admin')}
                                disabled={isActing}
                                className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#0e6245] hover:bg-[#0b4f37] active:bg-[#083a28] text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>{isActing ? 'Promoting...' : 'Promote to Admin'}</span>
                              </motion.button>
                            )}
                          </td>

                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Tab 2: metadata fields (add, edit, delete) */}
      {activeTab === 'metadata' && (
        <div className="space-y-6">
          
          {/* Add / Edit Dynamic Field Form */}
          <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-6 shadow-sm space-y-4 transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#222d3e]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#c4e3de]/40 dark:bg-[#0e6245]/20 text-[#0e6245] dark:text-emerald-300 flex items-center justify-center">
                  {editingFieldId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                    {editingFieldId ? "Edit Metadata Field Schema" : "Add Customizable Metadata Field"}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editingFieldId ? "Modifying existing schema configuration" : "Configure new dynamic fields without hardcoding"}
                  </p>
                </div>
              </div>

              {editingFieldId && (
                <button
                  type="button"
                  onClick={cancelEditingField}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Edit</span>
                </button>
              )}
            </div>

            <form onSubmit={handleAddField} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Field Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Field Name (e.g. "Department", "Quarter", "Classification")
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Department"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  />
                </div>

                {/* Field Type */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Field Type
                  </label>
                  <select
                    value={fieldType}
                    onChange={(e) => setFieldType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  >
                    <option value="select">Dropdown (Select list)</option>
                    <option value="text">Free Text Input</option>
                    <option value="number">Numeric Value</option>
                  </select>
                </div>

              </div>

              {/* If Select, show Comma-separated options */}
              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Predefined Options (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    placeholder="e.g. Finance, Human Resources, Engineering, Operations, Legal"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    These options will appear automatically in the upload modal and filter dropdowns.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="rounded border-slate-300 dark:border-[#222d3e] bg-white dark:bg-[#0d1117] text-[#0e6245] focus:ring-[#0e6245]"
                  />
                  <span>Mark as required field during upload</span>
                </label>

                <div className="flex items-center space-x-2">
                  {editingFieldId && (
                    <button
                      type="button"
                      onClick={cancelEditingField}
                      className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={submittingField}
                    className="px-4 py-2 bg-[#0e6245] hover:bg-[#0b4f37] active:bg-[#083a28] text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center space-x-1.5"
                  >
                    {editingFieldId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
                    <span>{submittingField ? (editingFieldId ? 'Saving...' : 'Adding...') : (editingFieldId ? 'Save Changes' : 'Create Dynamic Field')}</span>
                  </motion.button>
                </div>
              </div>
            </form>
          </div>

          {/* Active Fields Table */}
          <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-[#222d3e] flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#0e6245] dark:text-emerald-400" />
                <span>Configured Metadata Fields</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">{fields.length} active fields</span>
            </div>

            {loadingFields ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">Loading configured fields...</div>
            ) : fields.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">No dynamic fields configured yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#121721] border-b border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3">Field Name</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Options</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222d3e]">
                    {fields.map((f, idx) => (
                      <motion.tr 
                        key={f.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.18 }}
                        className="hover:bg-slate-50/60 dark:hover:bg-[#1c2436] transition-colors"
                      >
                        <td className="px-6 py-3.5 font-semibold text-slate-900 dark:text-white">{f.name}</td>
                        <td className="px-6 py-3.5 text-slate-600 dark:text-slate-400 uppercase font-medium">{f.field_type}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {f.options && f.options.length > 0 ? (
                              f.options.map((opt, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                                  {opt}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">Any input</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => startEditingField(f)}
                              className="text-slate-400 hover:text-[#0e6245] dark:text-slate-500 dark:hover:text-emerald-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Edit field"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteField(f.id, f.name)}
                              className="text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                              title="Delete field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Tab 3: audit log, with filters */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          
          {/* Header Card */}
          <div className="bg-white dark:bg-[#161d2a] p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-[#0e6245] dark:text-emerald-400" />
                <span>Immutable Security & Access Audit Trail</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Append-only log of document access requests, approvals, rejections, revocations, and role/division updates.
              </p>
            </div>
            
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#121721] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#222d3e] font-semibold">
                {auditEvents.length} Total Events
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={fetchAuditEvents}
                title="Reload audit logs from backend"
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100/90 dark:bg-[#121721] hover:bg-slate-200/70 dark:hover:bg-[#1f2838] rounded-xl border border-slate-200/80 dark:border-[#222d3e] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin text-[#0e6245] dark:text-emerald-400' : ''}`} />
              </motion.button>
            </div>
          </div>

          {/* Filter Controls Card */}
          <div className="bg-white dark:bg-[#161d2a] p-4 rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm space-y-3">
            {/* Top row: Search input + Actor dropdown + Date dropdown + Reset button */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
              
              {/* Text Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by actor, user, document, or note..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#121721] border border-slate-200/80 dark:border-[#222d3e] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0e6245] dark:focus:ring-emerald-400 transition-colors"
                />
                {auditSearchQuery && (
                  <button
                    onClick={() => setAuditSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Actor Dropdown Filter */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hidden sm:block" />
                <select
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-[#121721] border border-slate-200/80 dark:border-[#222d3e] rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0e6245] transition-colors cursor-pointer"
                >
                  <option value="all">All Actors ({uniqueAuditActors.length})</option>
                  {uniqueAuditActors.map(actor => (
                    <option key={actor} value={actor}>{actor}</option>
                  ))}
                </select>
              </div>

              {/* Date Range Dropdown Filter */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hidden sm:block" />
                <select
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-[#121721] border border-slate-200/80 dark:border-[#222d3e] rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0e6245] transition-colors cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                </select>
              </div>

              {/* Reset Filters Button */}
              {hasAuditFilters && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={resetAuditFilters}
                  className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-xl border border-rose-200/80 dark:border-rose-900/60 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </motion.button>
              )}
            </div>

            {/* Bottom row: Event Type Category Tabs */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#1e2636] flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 shrink-0 mr-1 flex items-center space-x-1">
                <Filter className="w-3 h-3" />
                <span>Type:</span>
              </span>

              {[
                { key: 'all', label: 'All', count: auditTypeCounts.all },
                { key: 'access_requested', label: 'Requested', count: auditTypeCounts.access_requested },
                { key: 'access_approved', label: 'Approved', count: auditTypeCounts.access_approved },
                { key: 'access_rejected', label: 'Rejected', count: auditTypeCounts.access_rejected },
                { key: 'access_revoked', label: 'Revoked', count: auditTypeCounts.access_revoked },
                { key: 'user_role_updated', label: 'Role Changes', count: auditTypeCounts.user_role_updated },
                { key: 'user_division_updated', label: 'Division Transfers', count: auditTypeCounts.user_division_updated },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setAuditEventType(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center space-x-1.5 ${
                    auditEventType === tab.key
                      ? 'bg-[#0e6245] text-white shadow-xs font-bold'
                      : 'bg-slate-100 dark:bg-[#121721] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    auditEventType === tab.key
                      ? 'bg-emerald-950/60 text-emerald-200'
                      : 'bg-slate-200/80 dark:bg-[#1e2636] text-slate-500 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Filter Result Counter Bar */}
            {hasAuditFilters && (
              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-800 dark:text-slate-200">{filteredAuditEvents.length}</strong> of {auditEvents.length} events
                </span>
                <button
                  onClick={resetAuditFilters}
                  className="text-[#0e6245] dark:text-emerald-400 hover:underline font-semibold"
                >
                  Clear all active filters
                </button>
              </div>
            )}
          </div>

          {/* Audit Events Table */}
          <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-sm overflow-hidden transition-colors">
            {loadingAudit ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#0e6245] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading audit trail...</span>
              </div>
            ) : filteredAuditEvents.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#121721] text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Filter className="w-5 h-5" />
                </div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  {hasAuditFilters ? 'No audit events match your filters' : 'No audit events recorded yet'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {hasAuditFilters 
                    ? 'Try adjusting your search query, actor selection, date range, or event type category.' 
                    : 'System access requests, decisions, role changes, and transfers will appear here.'}
                </p>
                {hasAuditFilters && (
                  <button
                    onClick={resetAuditFilters}
                    className="mt-3.5 inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-[#0e6245] dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear All Filters</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#121721] border-b border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="px-5 py-3.5">Event Type</th>
                      <th className="px-5 py-3.5">Actor</th>
                      <th className="px-5 py-3.5">Target / Subject</th>
                      <th className="px-5 py-3.5">Details & Notes</th>
                      <th className="px-5 py-3.5 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222d3e]">
                    {filteredAuditEvents.map((ev, idx) => {
                      let badge = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
                      if (ev.event_type === 'access_approved') badge = 'bg-emerald-50 dark:bg-emerald-950/50 text-[#0e6245] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60';
                      if (ev.event_type === 'access_rejected') badge = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60';
                      if (ev.event_type === 'access_revoked') badge = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60';
                      if (ev.event_type === 'user_role_updated') badge = 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60';
                      if (ev.event_type === 'user_division_updated') badge = 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60';
                      if (ev.event_type === 'access_requested') badge = 'bg-slate-100 dark:bg-[#1f2838] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';

                      return (
                        <motion.tr 
                          key={ev.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.015, 0.3), duration: 0.18 }}
                          className="hover:bg-slate-50/60 dark:hover:bg-[#1c2436] transition-colors"
                        >
                          {/* Event Type Badge */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${badge}`}>
                              {ev.event_type?.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Actor */}
                          <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#121721] text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-[#222d3e]">
                              {ev.actor_username || 'System'}
                            </span>
                          </td>

                          {/* Target / Subject */}
                          <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">
                            {ev.subject_username ? (
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-white">{ev.subject_username}</span>
                                {ev.doc_filename && (
                                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs" title={ev.doc_filename}>
                                    Doc: {ev.doc_filename}
                                  </span>
                                )}
                              </div>
                            ) : (
                              ev.doc_filename || 'N/A'
                            )}
                          </td>

                          {/* Details & Notes */}
                          <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
                            {ev.event_type === 'user_division_updated' && ev.old_division && ev.new_division ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-semibold text-[11px]">
                                  <span>{ev.old_division}</span>
                                  <span>→</span>
                                  <span>{ev.new_division}</span>
                                </span>
                                {ev.note && <p className="text-[11px] italic text-slate-500 dark:text-slate-400">{ev.note}</p>}
                              </div>
                            ) : ev.event_type === 'user_role_updated' && ev.old_role && ev.new_role ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-semibold text-[11px]">
                                  <span className="capitalize">{ev.old_role}</span>
                                  <span>→</span>
                                  <span className="capitalize">{ev.new_role}</span>
                                </span>
                                {ev.note && <p className="text-[11px] italic text-slate-500 dark:text-slate-400">{ev.note}</p>}
                              </div>
                            ) : (
                              <span className="line-clamp-2">{ev.note || 'No notes provided'}</span>
                            )}
                          </td>

                          {/* Timestamp */}
                          <td className="px-5 py-3.5 text-right text-slate-400 dark:text-slate-500 whitespace-nowrap text-[11px]">
                            {ev.created_at ? new Date(ev.created_at).toLocaleString() : 'N/A'}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </motion.div>
  );
}
