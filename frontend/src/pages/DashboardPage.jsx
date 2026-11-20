import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import UploadModal from '../components/UploadModal';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Upload, 
  Download, 
  Lock, 
  Unlock, 
  Clock,
  Search, 
  Eye, 
  Building2, 
  Tag, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  Grid,
  FolderOpen,
  Share2,
  Star,
  Send,
  Loader2,
  Calendar,
  Sparkles
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  // Category quick tabs: 'all' | 'my_uploads' | 'shared' | 'favorites'
  const [activeCategory, setActiveCategory] = useState('all');

  // Favorites state
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dms_favorite_doc_ids') || '[]');
    } catch {
      return [];
    }
  });

  const toggleFavorite = (e, docId) => {
    e.stopPropagation();
    const updated = favorites.includes(docId) 
      ? favorites.filter(id => id !== docId) 
      : [...favorites, docId];
    setFavorites(updated);
    localStorage.setItem('dms_favorite_doc_ids', JSON.stringify(updated));
  };

  // View Mode: 'table' | 'grid'
  const [viewMode, setViewMode] = useState('table');

  // Filters
  const [selectedDivision, setSelectedDivision] = useState(user?.role === 'admin' ? '' : (user?.division || ''));
  const [selectedReportType, setSelectedReportType] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dynamic fields for filter options
  const [reportTypeOptions, setReportTypeOptions] = useState([]);
  const [yearOptions, setYearOptions] = useState(['2024', '2025', '2026', '2027']);

  // Selected document IDs (for table multi-select)
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Pending access requests count
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Feedback notification banner
  const [actionMessage, setActionMessage] = useState(null);

  // Fetch documents from backend
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const params = {};
      if (user?.role === 'admin' && selectedDivision) {
        params.division = selectedDivision;
      }
      if (selectedReportType) params['Report Type'] = selectedReportType;
      if (selectedYear) params['Fiscal Year'] = selectedYear;

      const res = await client.get('/documents', { params });
      setDocuments(res.data?.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchMetadataFilters = async () => {
      try {
        const res = await client.get('/admin/metadata-fields');
        const fields = res.data?.fields || [];
        const reportTypeField = fields.find(f => f.name.toLowerCase() === 'report type');
        if (reportTypeField && reportTypeField.options) {
          setReportTypeOptions(reportTypeField.options);
        } else {
          setReportTypeOptions(['Financial', 'Audit', 'Technical', 'Operations', 'Legal']);
        }
        const yearField = fields.find(f => f.name.toLowerCase() === 'fiscal year');
        if (yearField && yearField.options) {
          setYearOptions(yearField.options);
        }
      } catch (err) {
        setReportTypeOptions(['Financial', 'Audit', 'Technical', 'Operations', 'Legal']);
      }
    };

    const fetchPendingCount = async () => {
      try {
        const res = await client.get('/access/inbox');
        const pending = (res.data?.requests || []).filter(r => r.status === 'pending');
        setPendingRequestsCount(pending.length);
      } catch (_) {}
    };

    fetchMetadataFilters();
    fetchPendingCount();
  }, []);

  useEffect(() => {
    fetchDocuments();
    setCurrentPage(1);
  }, [selectedDivision, selectedReportType, selectedYear]);

  // Handle file download
  const handleDownload = async (docId, filename) => {
    try {
      const response = await client.get(`/documents/${docId}/download`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'application/octet-stream' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setActionMessage({ type: 'success', text: `Downloaded "${filename}"` });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      let errMsg = 'Download failed or permission missing.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch (_) {}
      }
      setActionMessage({ type: 'error', text: errMsg });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Handle Cross-Division Access Request
  const handleRequestAccess = async (docId, filename) => {
    try {
      const res = await client.post('/access/request', { doc_id: docId });
      setActionMessage({ type: 'success', text: res.data?.message || `Access requested for "${filename}"` });
      fetchDocuments();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to submit access request.'
      });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Helper for file type badge
  const getFileBadge = (filename) => {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      return {
        label: 'PDF',
        bg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
      };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
      return {
        label: 'IMG',
        bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
      };
    }
    return {
      label: ext.toUpperCase() || 'DOC',
      bg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60'
    };
  };

  // Helper for Report Type badge styles
  const getReportTypeBadge = (type) => {
    const t = (type || '').toLowerCase();
    if (t === 'financial') {
      return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60';
    }
    if (t === 'technical') {
      return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60';
    }
    if (t === 'operations') {
      return 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60';
    }
    if (t === 'audit') {
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60';
    }
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  };

  const getInitials = (name) => {
    if (!name) return 'KU';
    return name.substring(0, 2).toUpperCase();
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0.0 KB';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Nov 18, 2026';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Client-side filtering
  const filteredDocs = documents.filter(doc => {
    if (activeCategory === 'my_uploads') {
      const uid = String(user?.id || user?.user_id || user?._id || '');
      const uname = String(user?.username || '').toLowerCase();
      const docOwner = String(doc.uploaded_by || '').toLowerCase();
      if (docOwner !== uid && docOwner !== uname) return false;
    } else if (activeCategory === 'shared') {
      if (doc.division === user?.division || !doc.can_download) return false;
    } else if (activeCategory === 'favorites') {
      if (!favorites.includes(doc.id)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (doc.filename || '').toLowerCase().includes(q);
      const matchDiv = (doc.division || '').toLowerCase().includes(q);
      const matchMeta = JSON.stringify(doc.metadata || {}).toLowerCase().includes(q);
      if (!matchName && !matchDiv && !matchMeta) return false;
    }

    return true;
  });

  // Calculate statistics
  const totalCount = documents.length;
  const ocrIndexedCount = documents.filter(d => Boolean(d.ocr_text && d.ocr_text.length > 0) || !d.ocr_restricted).length;
  const ocrPercentage = totalCount > 0 ? ((ocrIndexedCount / totalCount) * 100).toFixed(1) : '100';
  const myDivisionCount = documents.filter(d => d.division === (user?.division || 'Division A')).length;

  // Pagination calculation
  const totalPages = Math.ceil(filteredDocs.length / pageSize) || 1;
  const paginatedDocs = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Multi-select handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedDocIds(paginatedDocs.map(d => d.id));
    } else {
      setSelectedDocIds([]);
    }
  };

  const handleToggleSelectDoc = (id) => {
    if (selectedDocIds.includes(id)) {
      setSelectedDocIds(selectedDocIds.filter(i => i !== id));
    } else {
      setSelectedDocIds([...selectedDocIds, id]);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 pt-16 sm:pt-3.5 pb-8 space-y-5">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & MAIN ACTION BUTTON (Matching Mockup) */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-0 sm:pr-72 md:pr-80">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-1.5 h-6 bg-[#0e6245] dark:bg-emerald-400 rounded-full" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Document Hub
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Browse, manage, and upload division documents with OCR and role-based access control.
          </p>
        </div>

        {/* Action Button: Single "Upload Document" positioned in the gap to the left of the floating pill */}
        <div className="self-start sm:self-auto shrink-0">
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0e6245] hover:bg-[#0a4833] active:bg-[#073626] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-emerald-950/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span className="leading-none">Upload Document</span>
          </motion.button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={`flex items-center space-x-2 p-3.5 rounded-xl border text-xs sm:text-sm transition-all ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300' 
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{actionMessage.text}</span>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* 2. STAT CARDS ROW WITH SPRING MOTION (Matching Mockup 1) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Card 1: Total Documents */}
        <motion.div 
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0 }}
          whileHover={{ y: -5, scale: 1.015, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)" }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161d2a] border border-slate-200/80 dark:border-[#222d3e] shadow-2xs transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[#0e6245] dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#c4e3de]/50 dark:bg-emerald-950/60 text-[#065f46] dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
              +12%
            </span>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Documents</div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
            {totalCount}
          </div>
        </motion.div>

        {/* Card 2: OCR Indexed */}
        <motion.div 
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.06 }}
          whileHover={{ y: -5, scale: 1.015, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)" }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161d2a] border border-slate-200/80 dark:border-[#222d3e] shadow-2xs transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
              {ocrPercentage}%
            </span>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">OCR Indexed</div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
            {ocrIndexedCount}
          </div>
        </motion.div>

        {/* Card 3: My Division */}
        <motion.div 
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.12 }}
          whileHover={{ y: -5, scale: 1.015, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)" }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161d2a] border border-slate-200/80 dark:border-[#222d3e] shadow-2xs transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Users className="w-4.5 h-4.5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60">
              {user?.division || 'Division A'}
            </span>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">My Division</div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
            {myDivisionCount}
          </div>
        </motion.div>

        {/* Card 4: Access Requests */}
        <motion.div 
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.18 }}
          whileHover={{ y: -5, scale: 1.015, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)" }}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161d2a] border border-slate-200/80 dark:border-[#222d3e] shadow-2xs transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              {pendingRequestsCount} Pending
            </span>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Access Requests</div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
            {pendingRequestsCount}
          </div>
        </motion.div>

      </div>

      {/* ========================================================================= */}
      {/* 3. CATEGORY TABS (Matching Mockup 2: All / My Uploads / Shared / Favorites) */}
      {/* ========================================================================= */}
      <div className="flex items-center space-x-1 sm:space-x-2 border-b border-slate-200/80 dark:border-[#1e2636] pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => { setActiveCategory('all'); setCurrentPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
            activeCategory === 'all'
              ? 'bg-[#c4e3de]/50 dark:bg-emerald-950/50 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>All Documents</span>
        </button>

        <button
          onClick={() => { setActiveCategory('my_uploads'); setCurrentPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
            activeCategory === 'my_uploads'
              ? 'bg-[#c4e3de]/50 dark:bg-emerald-950/50 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>My Uploads</span>
        </button>

        <button
          onClick={() => { setActiveCategory('shared'); setCurrentPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
            activeCategory === 'shared'
              ? 'bg-[#c4e3de]/50 dark:bg-emerald-950/50 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Shared with Me</span>
        </button>

        <button
          onClick={() => { setActiveCategory('favorites'); setCurrentPage(1); }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
            activeCategory === 'favorites'
              ? 'bg-[#c4e3de]/50 dark:bg-emerald-950/50 text-[#065f46] dark:text-emerald-300 font-bold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
          <span>Favorites ({favorites.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 4. FILTER TOOLBAR (Matching Mockup 1) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#161d2a] p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Division Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            {user?.role === 'admin' ? (
              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Division: All Divisions</option>
                <option value="Division A">Division: Division A</option>
                <option value="Division B">Division: Division B</option>
                <option value="Division C">Division: Division C</option>
              </select>
            ) : (
              <span className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300">
                Division: {user?.division || 'My Division'}
              </span>
            )}
          </div>

          {/* Report Type Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="">Report Type: All Types</option>
              {reportTypeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="">Year: All Years</option>
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {((user?.role === 'admin' && selectedDivision) || selectedReportType || selectedYear) && (
            <button
              onClick={() => {
                setSelectedDivision(user?.role === 'admin' ? '' : (user?.division || ''));
                setSelectedReportType('');
                setSelectedYear('');
              }}
              className="text-xs text-[#0e6245] dark:text-emerald-400 hover:underline px-2 py-1 font-medium"
            >
              Reset
            </button>
          )}

        </div>

        {/* Right: Quick Search & View Toggle */}
        <div className="flex items-center space-x-2">
          
          {/* Quick search input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center rounded-lg bg-slate-100 dark:bg-[#121721] p-0.5 border border-slate-200 dark:border-[#222d3e]">
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' 
                  ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-400 shadow-2xs font-bold' 
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-400 shadow-2xs font-bold' 
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 5. DOCUMENTS CONTAINER (Table or Grid View) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-2xs overflow-hidden transition-colors">
        
        {/* Section Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-[#1e2636] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-1.5 h-4.5 bg-[#0e6245] dark:bg-emerald-400 rounded-full" />
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">
              Documents
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              • {filteredDocs.length} {filteredDocs.length === 1 ? 'document' : 'documents'} {selectedDivision ? `in ${selectedDivision}` : 'in workspace'}
            </span>
          </div>

          {selectedDocIds.length > 0 && (
            <span className="text-xs font-semibold text-[#065f46] dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-lg">
              {selectedDocIds.length} selected
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#0e6245] dark:border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading documents...</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#121721] text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
              <FolderOpen className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">No documents found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              There are no documents matching your selected filters in {selectedDivision || 'your division'}.
            </p>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="mt-4 px-4 py-1.5 bg-[#0e6245] hover:bg-[#0a4833] text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Upload Document
            </button>
          </div>
        ) : viewMode === 'table' ? (
          
          /* ---------------- TABLE VIEW (Streamlined Single-View Layout) ---------------- */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 dark:bg-[#121721]/80 border-b border-slate-200/80 dark:border-[#222d3e] text-slate-500 dark:text-slate-400 font-semibold select-none">
                <tr>
                  <th className="w-9 px-3 py-2.5 text-center">
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll}
                      checked={selectedDocIds.length > 0 && selectedDocIds.length === paginatedDocs.length}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#0e6245] focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-300">Document Name</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Report Type</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Division</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Uploaded By</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Uploaded On</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">OCR Status</th>
                  <th className="px-2.5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Access</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e2636]">
                {paginatedDocs.map((doc, idx) => {
                  const hasAccess = doc.can_download;
                  const fileBadge = getFileBadge(doc.filename);
                  const reportType = doc.metadata?.['Report Type'] || 'General';
                  const isSelected = selectedDocIds.includes(doc.id);
                  const isOcrIndexed = doc.ocr_text && doc.ocr_text.length > 0;
                  const isFav = favorites.includes(doc.id);

                  return (
                    <motion.tr 
                      key={doc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: 0.02 * idx }}
                      className={`hover:bg-slate-50/70 dark:hover:bg-[#1a2332]/60 transition-colors ${
                        isSelected ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="w-9 px-3 py-2.5 text-center">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => handleToggleSelectDoc(doc.id)}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#0e6245] focus:ring-emerald-500"
                        />
                      </td>

                      {/* Document Name & Size (Shortened & Truncated) */}
                      <td className="px-3 py-2.5 min-w-0">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => toggleFavorite(e, doc.id)}
                            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                            className="text-slate-300 dark:text-slate-600 hover:text-amber-500 transition-colors shrink-0"
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-500 fill-amber-500' : ''}`} />
                          </button>

                          <div className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-wider shrink-0 ${fileBadge.bg}`}>
                            {fileBadge.label}
                          </div>
                          <div className="min-w-0">
                            <div 
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="font-semibold text-slate-900 dark:text-white hover:text-[#0e6245] dark:hover:text-emerald-400 cursor-pointer truncate max-w-[120px] sm:max-w-[150px] md:max-w-[170px] lg:max-w-[190px] xl:max-w-[230px] transition-colors"
                              title={doc.filename}
                            >
                              {doc.filename}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              {formatSize(doc.file_size)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Report Type */}
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getReportTypeBadge(reportType)}`}>
                          {reportType}
                        </span>
                      </td>

                      {/* Division (Guaranteed Single-Line No Wrapping) */}
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                          {doc.division}
                        </span>
                      </td>

                      {/* Uploaded By */}
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-[#1f2838] text-slate-700 dark:text-slate-300 font-bold text-[9px] flex items-center justify-center shrink-0">
                            {getInitials(doc.uploaded_by || 'Admin')}
                          </div>
                          <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[70px] xl:max-w-[85px]" title={doc.uploaded_by || 'Admin'}>
                            {doc.uploaded_by || 'Admin'}
                          </span>
                        </div>
                      </td>

                      {/* Uploaded On */}
                      <td className="px-2.5 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                        {formatDate(doc.created_at)}
                      </td>

                      {/* OCR Status */}
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        {isOcrIndexed ? (
                          <div className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Indexed</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1 text-sky-600 dark:text-sky-400 font-medium text-[11px]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Processing</span>
                          </div>
                        )}
                      </td>

                      {/* Access Status */}
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        {hasAccess ? (
                          <div className="inline-flex items-center space-x-1 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                            <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Full Access</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span>{doc.has_pending_request ? 'Pending' : 'Restricted'}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-0.5">
                          <button
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            title="View Document Details"
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2838] rounded-md transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {hasAccess ? (
                            <button
                              onClick={() => handleDownload(doc.id, doc.filename)}
                              title="Download File"
                              className="p-1 text-[#0e6245] dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-md transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRequestAccess(doc.id, doc.filename)}
                              disabled={doc.has_pending_request}
                              title={doc.has_pending_request ? "Request Pending Review" : "Request Access"}
                              className={`p-1 rounded-md transition-colors ${
                                doc.has_pending_request 
                                  ? 'text-slate-400 opacity-60 cursor-not-allowed' 
                                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        ) : (

          /* ---------------- GRID CARDS VIEW ---------------- */
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedDocs.map((doc, idx) => {
              const hasAccess = doc.can_download;
              const fileBadge = getFileBadge(doc.filename);
              const reportType = doc.metadata?.['Report Type'] || 'General';

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.03 * idx }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="min-w-0 overflow-hidden bg-slate-50/60 dark:bg-[#121721] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] hover:border-slate-300 dark:hover:border-[#2d3a4e] p-4 shadow-sm transition-all flex flex-col justify-between"
                >
                  <div className="min-w-0">
                    {/* Top Row: File icon & division */}
                    <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
                      <div className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-extrabold tracking-wider ${fileBadge.bg}`}>
                        {fileBadge.label}
                      </div>

                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className="truncate px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50"
                          title={doc.division}
                        >
                          {doc.division}
                        </span>
                        {hasAccess ? (
                          <Unlock className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        )}
                      </div>
                    </div>

                    {/* Filename: wraps at any character (long names have no spaces), max 2 lines */}
                    <h3
                      onClick={() => navigate(`/documents/${doc.id}`)}
                      className="font-semibold text-slate-900 dark:text-white text-xs hover:text-[#0e6245] dark:hover:text-emerald-400 cursor-pointer line-clamp-2 break-all transition-colors"
                      title={doc.filename}
                    >
                      {doc.filename}
                    </h3>

                    {/* Metadata Badges */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5 min-w-0">
                      <span
                        className={`max-w-full truncate px-2 py-0.5 rounded-md text-[10px] font-semibold ${getReportTypeBadge(reportType)}`}
                        title={reportType}
                      >
                        {reportType}
                      </span>
                      {doc.ocr_text && (
                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold border border-emerald-200/60 dark:border-emerald-800/60 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Indexed</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-[#222d3e] flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {formatSize(doc.file_size)}
                    </span>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2838] rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {hasAccess && (
                        <button
                          onClick={() => handleDownload(doc.id, doc.filename)}
                          className="px-2.5 py-1 bg-[#0e6245] hover:bg-[#0a4833] text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>

                </motion.div>
              );
            })}
          </div>

        )}

        {/* ========================================================================= */}
        {/* 6. PAGINATION FOOTER (Matching Mockup 1) */}
        {/* ========================================================================= */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-[#1e2636] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-800 dark:text-slate-200">
              {filteredDocs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </span> – <span className="font-semibold text-slate-800 dark:text-slate-200">
              {Math.min(currentPage * pageSize, filteredDocs.length)}
            </span> of <span className="font-semibold text-slate-800 dark:text-slate-200">
              {filteredDocs.length}
            </span> documents
          </div>

          <div className="flex items-center space-x-1 self-center sm:self-auto">
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#121721] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              if (totalPages > 5 && Math.abs(pg - currentPage) > 2 && pg !== 1 && pg !== totalPages) {
                return null;
              }
              return (
                <motion.button
                  key={pg}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setCurrentPage(pg)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                    currentPage === pg 
                      ? 'bg-[#0e6245] text-white font-bold shadow-2xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#121721]'
                  }`}
                >
                  {pg}
                </motion.button>
              );
            })}

            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#222d3e] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#121721] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>

      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => fetchDocuments()}
      />

    </div>
  );
}
