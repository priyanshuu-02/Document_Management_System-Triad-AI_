// Upload form. Shows one input per metadata field the admin set up, and lets
// the user add extra fields of their own. The file is OCR'd on the server.
import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isDivisionField } from '../api/metadataFields';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileUp, Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [file, setFile] = useState(null);
  const [metadataFields, setMetadataFields] = useState([]);
  // Normal users don't see the Division field: their division is fixed.
  const visibleFields = isAdmin ? metadataFields : metadataFields.filter(f => !isDivisionField(f));
  const [dynamicValues, setDynamicValues] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');
  
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccess('');
    setFile(null);
    setCustomFields([]);

    // Fetch configurable dynamic fields
    const fetchFields = async () => {
      try {
        const res = await client.get('/admin/metadata-fields');
        const fields = res.data?.fields || [];
        setMetadataFields(fields);

        // Start each dropdown on its first option, and Division on the user's own.
        const defaults = {};
        fields.forEach(f => {
          defaults[f.name] = f.options && f.options.length > 0 ? f.options[0] : '';
          if (isDivisionField(f)) defaults[f.name] = user?.division || defaults[f.name];
        });
        setDynamicValues(defaults);
      } catch (err) {
        console.error('Failed to load metadata fields:', err);
      }
    };

    fetchFields();
  }, [isOpen]);

  const handleFieldChange = (name, value) => {
    setDynamicValues(prev => ({ ...prev, [name]: value }));
  };

  const handleAddCustomField = () => {
    if (!customKey.trim() || !customVal.trim()) return;
    setCustomFields(prev => [...prev, { key: customKey.trim(), val: customVal.trim() }]);
    setCustomKey('');
    setCustomVal('');
  };

  const handleRemoveCustomField = (index) => {
    setCustomFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Collect all metadata: the admin-defined fields plus any extra
      // fields the user added by hand.
      const finalMetadata = { ...dynamicValues };
      customFields.forEach(f => {
        finalMetadata[f.key] = f.val;
      });
      // Users always upload into their own division (the server checks this
      // too). Only admins can choose another one.
      finalMetadata.Division = isAdmin ? (dynamicValues.Division || user?.division) : user?.division;

      formData.append('metadata', JSON.stringify(finalMetadata));

      const res = await client.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess('Document uploaded and OCR processed successfully!');
      setTimeout(() => {
        onUploadSuccess && onUploadSuccess(res.data?.document);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Animated Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs"
          />

          {/* Animated Modal Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            className="relative z-10 bg-white dark:bg-[#161d2a] rounded-2xl shadow-2xl border border-slate-200/90 dark:border-[#222d3e] max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-[#1e2636]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[#0e6245] dark:text-emerald-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Upload New Document</h3>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#121721] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="flex items-start space-x-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-start space-x-2 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* File Dropzone */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Select Document (PDF, TXT, Image)
                </label>
                <label className="border-2 border-dashed border-slate-200 dark:border-[#222d3e] hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-[#121721]/60 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                  />
                  <FileUp className="w-8 h-8 text-[#0e6245] dark:text-emerald-400 mb-2" />
                  {file ? (
                    <div className="text-center">
                      <p className="font-semibold text-slate-900 dark:text-white text-xs truncate max-w-xs">{file.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Click to browse or drop file here</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Supports PDF, TXT, PNG, JPG (Max 50MB)</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Dynamic Metadata Schema Inputs */}
              {visibleFields.length > 0 && (
                <div className="space-y-3 pt-2">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Metadata Attributes
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleFields.map((f) => (
                      <div key={f.id} className="space-y-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                          {f.name} {f.required && <span className="text-rose-500">*</span>}
                        </label>
                        {f.field_type === 'select' ? (
                          <select
                            value={dynamicValues[f.name] || ''}
                            onChange={(e) => handleFieldChange(f.name, e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-medium"
                          >
                            <option value="">Select {f.name}...</option>
                            {(f.options || []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.field_type === 'number' ? 'number' : 'text'}
                            value={dynamicValues[f.name] || ''}
                            onChange={(e) => handleFieldChange(f.name, e.target.value)}
                            placeholder={`Enter ${f.name}...`}
                            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-medium"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ad-Hoc Key-Value Pairs */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Custom Tags (Ad-Hoc)
                  </label>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </div>

                {customFields.length > 0 && (
                  <div className="space-y-1.5">
                    {customFields.map((field, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-[#121721] rounded-lg border border-slate-200 dark:border-[#222d3e] text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{field.key}:</span>
                        <span className="text-slate-600 dark:text-slate-400 truncate max-w-xs">{field.val}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomField(idx)}
                          className="text-slate-400 hover:text-rose-500 transition-colors ml-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder="Key (e.g. Project)"
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <input
                    type="text"
                    value={customVal}
                    onChange={(e) => setCustomVal(e.target.value)}
                    placeholder="Value (e.g. Phoenix)"
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-[#222d3e] rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-[#121721] hover:bg-slate-200 dark:hover:bg-[#1a2332] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#222d3e] rounded-lg font-semibold transition-colors flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-4 border-t border-slate-100 dark:border-[#1e2636] flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#121721] rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  type="submit"
                  disabled={uploading || !file}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0e6245] hover:bg-[#0a4833] active:bg-[#073626] rounded-xl shadow-md shadow-emerald-950/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Extracting OCR & Storing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload & Run OCR</span>
                    </>
                  )}
                </motion.button>
              </div>

            </form>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
