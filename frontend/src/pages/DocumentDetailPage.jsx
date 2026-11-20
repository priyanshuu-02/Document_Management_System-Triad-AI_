import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Lock, 
  Unlock, 
  Clock,
  Copy, 
  Check, 
  Building2, 
  Calendar, 
  HardDrive, 
  Tag, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/documents/${id}`);
      setDocData(res.data?.document);
    } catch (err) {
      setError(err.response?.data?.error || 'Document not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleDownload = async () => {
    if (!docData) return;
    setDownloading(true);
    try {
      const response = await client.get(`/documents/${id}/download`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || docData.content_type || 'application/octet-stream' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', docData.filename || 'downloaded_file');
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      
      setActionMessage({ type: 'success', text: `Downloaded "${docData.filename}"` });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      console.error('Download error:', err);
      let errMsg = 'Download failed or permission missing.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch (_) {}
      } else if (err.response?.data?.error) {
        errMsg = err.response.data.error;
      }
      setActionMessage({ type: 'error', text: errMsg });
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setDownloading(false);
    }
  };

  const handleRequestAccess = async () => {
    setRequesting(true);
    // Instantly update local state to show Request Pending
    setDocData(prev => prev ? ({ ...prev, has_pending_request: true }) : prev);

    try {
      const res = await client.post('/access/request', { doc_id: id });
      setActionMessage({ 
        type: 'success', 
        text: res.data?.message || 'Access request submitted successfully!' 
      });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setDocData(prev => prev ? ({ ...prev, has_pending_request: false }) : prev);
      setActionMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'Failed to submit access request.' 
      });
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setRequesting(false);
    }
  };

  const handleCopyText = () => {
    if (!docData?.ocr_text) return;
    navigator.clipboard.writeText(docData.ocr_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-[#0e6245] border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading document details...</span>
      </div>
    );
  }

  if (error || !docData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Document Unavailable</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error || 'Unable to retrieve document.'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-4 py-2 bg-[#0e6245] hover:bg-[#0b4f37] text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Return to Hub
        </button>
      </div>
    );
  }

  const hasAccess = docData.can_download;
  const hasPending = docData.has_pending_request;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-3.5 pb-8 space-y-5"
    >
      
      {/* Navigation & Action Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Document Hub</span>
        </button>

      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center space-x-2 p-3.5 rounded-xl border text-sm transition-all ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300' 
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </motion.div>
      )}

      {/* Main Document Summary Card */}
      <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-6 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[#c4e3de]/40 dark:bg-[#0e6245]/20 text-[#0e6245] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white break-all">{docData.filename}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{docData.division}</span>
                </span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <span>{(docData.file_size / 1024).toFixed(1)} KB</span>
                </span>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <span>{new Date(docData.created_at).toLocaleDateString()}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Status badge + primary action, kept inside the card next to the
              filename so the floating top header can never cover it */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {hasAccess ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-[#0e6245] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Unlock className="w-3.5 h-3.5" />
                <span>Access Granted</span>
              </span>
            ) : hasPending ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Request Pending Review</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Lock className="w-3.5 h-3.5" />
                <span>Division Restricted</span>
              </span>
            )}

            {hasAccess ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-[#0e6245] hover:bg-[#0b4f37] active:bg-[#083a28] text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? 'Downloading...' : 'Download File'}</span>
              </motion.button>
            ) : hasPending ? (
              <button
                disabled
                className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-semibold cursor-not-allowed opacity-90 shadow-sm"
                title="Access request is currently pending approval by division members"
              >
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Request Pending</span>
              </button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRequestAccess}
                disabled={requesting}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-[#0e6245] hover:bg-[#0b4f37] active:bg-[#083a28] text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{requesting ? 'Submitting Request...' : 'Request Access'}</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Dynamic Metadata & OCR Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Dynamic Metadata Section */}
        <div className="bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-6 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
              <Tag className="w-4 h-4 text-[#0e6245] dark:text-emerald-400" />
              <span>Dynamic Custom Metadata</span>
            </h3>
          </div>

          <div className="space-y-3">
            {Object.keys(docData.metadata || {}).length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No custom metadata tags assigned.</p>
            ) : (
              Object.entries(docData.metadata).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{key}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700">
                    {String(val)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* OCR Extracted Text Section */}
        <div className="lg:col-span-2 bg-white dark:bg-[#161d2a] rounded-2xl border border-slate-200/80 dark:border-[#222d3e] p-6 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <div className={`w-2.5 h-2.5 rounded-full ${hasAccess ? 'bg-[#0e6245] animate-pulse' : 'bg-amber-500'}`}></div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                OCR Extracted Content
              </h3>
              {hasAccess && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  ({docData.ocr_text ? docData.ocr_text.length : 0} characters)
                </span>
              )}
            </div>

            {hasAccess && docData.ocr_text && (
              <button
                onClick={handleCopyText}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            )}
          </div>

          {!hasAccess ? (
            <div className="p-8 text-center bg-slate-50/80 dark:bg-slate-950/60 rounded-xl border border-dashed border-amber-200/90 dark:border-amber-800/80 flex flex-col items-center justify-center space-y-3 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">OCR Extracted Content Restricted</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  The textual content extracted by the OCR engine is protected under {docData.division} access control. Submit an access request above to unlock full OCR text preview and file download permissions.
                </p>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-100/70 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-full text-[11px] font-semibold border border-amber-200 dark:border-amber-800/80">
                  <Lock className="w-3 h-3" />
                  <span>Confidential • Division Isolation Active</span>
                </span>
              </div>
            </div>
          ) : docData.ocr_text ? (
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
              {docData.ocr_text}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-950 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
              No textual content detected by OCR engine for this document.
            </div>
          )}
        </div>

      </div>

    </motion.div>
  );
}
