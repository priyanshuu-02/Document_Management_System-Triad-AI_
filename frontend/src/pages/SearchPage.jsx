import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  FileText, 
  Download, 
  Lock, 
  Unlock, 
  Clock, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  X,
  Filter,
  SlidersHorizontal,
  Building2,
  Tag,
  Calendar,
  Send,
  Loader2,
  Sparkles
} from 'lucide-react';

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(urlQuery);
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'filters'
  
  // Filter Dropdown states
  const [filterDivision, setFilterDivision] = useState('');
  const [filterReportType, setFilterReportType] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const quickFilters = [
    'Financial',
    'Technical',
    'Operations',
    'Audit',
    'Division A',
    'Division B',
    'Division C'
  ];

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
      bg: 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60'
    };
  };

  // Perform search
  const handleSearch = async (searchTerm = query) => {
    const term = (searchTerm || '').trim();
    if (!term && !filterDivision && !filterReportType && !filterYear) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await client.get('/search', {
        params: { q: term || filterDivision || filterReportType || filterYear }
      });
      let fetched = res.data?.results || [];

      // If filter dropdowns were selected, apply additional refining
      if (filterDivision) {
        fetched = fetched.filter(d => (d.division || '').toLowerCase() === filterDivision.toLowerCase());
      }
      if (filterReportType) {
        fetched = fetched.filter(d => (d.metadata?.['Report Type'] || '').toLowerCase() === filterReportType.toLowerCase());
      }
      if (filterYear) {
        fetched = fetched.filter(d => (d.metadata?.['Fiscal Year'] || '').includes(filterYear));
      }

      setResults(fetched);
    } catch (err) {
      console.error('Search error:', err);
      setActionMessage({ type: 'error', text: 'Failed to execute search.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle URL query on mount
  useEffect(() => {
    if (urlQuery) {
      setQuery(urlQuery);
      handleSearch(urlQuery);
    }
  }, [urlQuery]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleQuickFilterClick = (term) => {
    setQuery(term);
    handleSearch(term);
  };

  // Download handler
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
      let errMsg = 'Download failed or permission required.';
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

  // Access request handler with immediate local state update
  const handleRequestAccess = async (docId, filename) => {
    setResults(prevResults =>
      prevResults.map(item =>
        item.id === docId ? { ...item, has_pending_request: true } : item
      )
    );

    try {
      const res = await client.post('/access/request', { doc_id: docId });
      setActionMessage({ 
        type: 'success', 
        text: res.data?.message || `Access request submitted for "${filename}"` 
      });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setResults(prevResults =>
        prevResults.map(item =>
          item.id === docId ? { ...item, has_pending_request: false } : item
        )
      );
      setActionMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to submit request.' 
      });
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-3.5 pb-8 space-y-5">
      
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER (Matching Mockup 3) */}
      {/* ========================================================================= */}
      <div className="pr-0 sm:pr-72 md:pr-80">
        <div className="flex items-center space-x-2.5">
          <div className="w-1.5 h-6 bg-[#0e6245] dark:bg-emerald-400 rounded-full" />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Advanced Search
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Find exactly what you need using full-text search and metadata filters.
        </p>
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
      {/* 2. SEARCH & FILTERS CARD (Matching Mockup 3) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] shadow-2xs overflow-hidden transition-colors">
        
        {/* Top Tab Bar: Search vs Filters */}
        <div className="px-6 pt-3 border-b border-slate-100 dark:border-[#1e2636] flex items-center space-x-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center space-x-2 pb-3 transition-colors ${
              activeTab === 'search'
                ? 'text-[#065f46] dark:text-emerald-300 border-b-2 border-[#0e6245] dark:border-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>

          <button
            onClick={() => setActiveTab('filters')}
            className={`flex items-center space-x-2 pb-3 transition-colors ${
              activeTab === 'filters'
                ? 'text-[#065f46] dark:text-emerald-300 border-b-2 border-[#0e6245] dark:border-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>
        </div>

        {/* Card Body */}
        <div className="p-5 sm:p-6 space-y-4">
          
          {/* Main Search Input Bar */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by keyword, filename, or OCR content..."
              className="w-full pl-11 pr-28 py-2.5 bg-slate-50/80 dark:bg-[#121721] focus:bg-white dark:focus:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition-all font-medium"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-24 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                title="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSearch()}
              className="absolute right-1.5 px-5 py-1.5 bg-[#0e6245] hover:bg-[#0a4833] active:bg-[#073626] text-white rounded-lg text-xs font-bold transition-all shadow-2xs"
            >
              Search
            </motion.button>
          </div>

          {/* Quick Filters Row (Matching Mockup 3) */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-400 mr-1 shrink-0">
              Quick filters:
            </span>
            {quickFilters.map((term) => (
              <motion.button
                key={term}
                whileHover={{ y: -2, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickFilterClick(term)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                  query.toLowerCase() === term.toLowerCase()
                    ? 'bg-[#c4e3de]/50 dark:bg-emerald-950/60 text-[#065f46] dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-bold'
                    : 'bg-slate-50 dark:bg-[#121721] hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#222d3e]'
                }`}
              >
                {term}
              </motion.button>
            ))}
          </div>

          {/* Filters Expanded View (When 'Filters' tab is active) */}
          {activeTab === 'filters' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 mt-2 border-t border-slate-100 dark:border-[#1e2636] grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              {/* Division Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Division
                </label>
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  <option value="">All Divisions</option>
                  <option value="Division A">Division A</option>
                  <option value="Division B">Division B</option>
                  <option value="Division C">Division C</option>
                </select>
              </div>

              {/* Report Type Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Report Type
                </label>
                <select
                  value={filterReportType}
                  onChange={(e) => setFilterReportType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  <option value="">All Report Types</option>
                  <option value="Financial">Financial</option>
                  <option value="Technical">Technical</option>
                  <option value="Operations">Operations</option>
                  <option value="Audit">Audit</option>
                  <option value="Legal">Legal</option>
                </select>
              </div>

              {/* Year Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Fiscal Year
                </label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  <option value="">All Years</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>

            </motion.div>
          )}

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. SEARCH RESULTS LIST */}
      {/* ========================================================================= */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e]">
          <div className="w-8 h-8 border-3 border-[#0e6245] dark:border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Searching metadata and OCR text...</span>
        </div>
      ) : hasSearched && results.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-12 text-center shadow-2xs transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#121721] text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">No matches found for "{query}"</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Try searching for broader terms or keywords present in filenames, metadata attributes, or OCR content.
          </p>
        </motion.div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          
          {/* Results count bar */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>Found <strong className="text-slate-800 dark:text-slate-200">{results.length}</strong> matching {results.length === 1 ? 'document' : 'documents'}</span>
          </div>

          {/* Result Cards */}
          <div className="space-y-3">
            {results.map((doc, idx) => {
              const hasAccess = doc.can_download;
              const hasPending = doc.has_pending_request;
              const fileBadge = getFileBadge(doc.filename);

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 20, delay: idx * 0.04 }}
                  whileHover={{ y: -3, transition: { duration: 0.15 } }}
                  className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] hover:border-slate-300 dark:hover:border-[#2d3a4e] p-4.5 sm:p-5 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    
                    {/* Header info */}
                    <div className="flex items-center space-x-2.5">
                      <div className={`px-1.5 py-1 rounded-md text-[10px] font-extrabold tracking-wider ${fileBadge.bg}`}>
                        {fileBadge.label}
                      </div>

                      <h4
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="font-bold text-slate-900 dark:text-white text-sm hover:text-[#0e6245] dark:hover:text-emerald-400 cursor-pointer transition-colors"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </h4>

                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#c4e3de]/40 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                        {doc.division}
                      </span>
                    </div>

                    {/* Matched Fields Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400 dark:text-slate-500">Matched in:</span>
                      {(doc.matched_fields || []).map((field, fIdx) => (
                        <span 
                          key={fIdx}
                          className="px-2 py-0.5 rounded-md bg-emerald-50/70 dark:bg-emerald-950/40 text-[#065f46] dark:text-emerald-300 font-semibold border border-emerald-200/50 dark:border-emerald-800/50 capitalize"
                        >
                          {field.replace('metadata:', '')}
                        </span>
                      ))}
                    </div>

                    {/* OCR Snippet preview */}
                    {doc.snippet && (
                      <p className="text-xs font-mono bg-slate-50 dark:bg-[#121721] p-2.5 rounded-xl border border-slate-200/70 dark:border-[#222d3e] text-slate-700 dark:text-slate-300 max-w-2xl leading-relaxed">
                        "{doc.snippet}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 shrink-0 self-start md:self-center">
                    <button
                      onClick={() => navigate(`/documents/${doc.id}`)}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#121721] rounded-xl transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {hasAccess ? (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDownload(doc.id, doc.filename)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#0e6245] hover:bg-[#0a4833] text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </motion.button>
                    ) : hasPending ? (
                      <button
                        disabled
                        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 rounded-xl text-xs font-semibold cursor-not-allowed opacity-90"
                        title="Access request is currently pending approval"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Request Pending</span>
                      </button>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRequestAccess(doc.id, doc.filename)}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Request Access</span>
                      </motion.button>
                    )}
                  </div>

                </motion.div>
              );
            })}
          </div>

        </div>
      ) : (
        /* Initial Guidance Banner before searching */
        <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-8 text-center shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-[#0e6245] dark:text-emerald-400 flex items-center justify-center mx-auto mb-2.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Full-Text OCR & Metadata Indexing</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Search keywords inside scanned document text, document metadata tags, or division assignments.
          </p>
        </div>
      )}

    </div>
  );
}
