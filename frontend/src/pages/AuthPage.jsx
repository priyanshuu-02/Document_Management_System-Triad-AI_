import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import client from '../api/client';
import { 
  FileText, 
  Shield, 
  Building2, 
  User, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle,
  Sun,
  Moon
} from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [division, setDivision] = useState('Division A');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const res = await client.post('/auth/login', {
          identifier: email || username,
          password
        });
        login(res.data.token, res.data.user);
        navigate('/dashboard');
      } else {
        const res = await client.post('/auth/register', {
          username,
          email,
          password,
          division
        });
        login(res.data.token, res.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoEmail) => {
    setIsLogin(true);
    setUsername('');
    setEmail(demoEmail);
    setPassword('Password123!');
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#f8faf9] dark:bg-[#0d1117] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors duration-200">
      
      {/* Top Floating Theme Switcher */}
      <div className="absolute top-6 right-6">
        <motion.button
          whileTap={{ rotate: 180, scale: 0.9 }}
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-2.5 rounded-xl bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-[#222d3e] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-amber-300 shadow-sm transition-all"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </motion.button>
      </div>

      {/* Brand Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sm:mx-auto sm:w-full sm:max-w-md text-center"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0e6245] text-white shadow-lg shadow-[#0e6245]/20 mb-3">
          <FileText className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          DMS Workspace
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Document Management System with OCR & Access Control
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="bg-white dark:bg-[#161d2a] py-8 px-6 shadow-sm border border-slate-200/80 dark:border-[#222d3e] rounded-2xl sm:px-10 transition-colors">
          
          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-[#0d1117] p-1 mb-6 border border-slate-200/60 dark:border-[#222d3e]">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                isLogin 
                  ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-300 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                !isLogin 
                  ? 'bg-white dark:bg-[#161d2a] text-[#0e6245] dark:text-emerald-300 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start space-x-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* If Registering, show Username */}
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name / Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alice_smith"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  />
                </div>
              </div>
            )}

            {/* Email or Identifier */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isLogin ? 'Username or Email' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={isLogin ? "text" : "email"}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isLogin ? "alice@company.com or alice" : "alice@company.com"}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                />
              </div>
            </div>

            {/* Division Selection on Register */}
            {!isLogin && (
              <div className="pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Assign Division
                  </label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-[#222d3e] text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e6245]"
                  >
                    <option value="Division A">Division A</option>
                    <option value="Division B">Division B</option>
                    <option value="Division C">Division C</option>
                  </select>
                </div>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#0e6245] hover:bg-[#0b4f37] active:bg-[#083a28] text-white text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Register & Enter'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

          </form>

          {/* Seeded reviewer accounts: these sign in; they do not create roles. */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-[#222d3e]">
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 text-center">
              Seeded Demo Accounts (1-Click Sign In)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => handleDemoLogin('alice@triad.ai')}
                className="py-1.5 px-2 text-[11px] font-medium bg-slate-50 dark:bg-[#0d1117] hover:bg-[#c4e3de]/40 dark:hover:bg-[#0e6245]/20 hover:text-[#0e6245] dark:hover:text-emerald-300 border border-slate-200 dark:border-[#222d3e] rounded-lg transition-colors text-slate-700 dark:text-slate-300 text-center"
              >
                Alice (Div A)
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => handleDemoLogin('bob@triad.ai')}
                className="py-1.5 px-2 text-[11px] font-medium bg-slate-50 dark:bg-[#0d1117] hover:bg-[#c4e3de]/40 dark:hover:bg-[#0e6245]/20 hover:text-[#0e6245] dark:hover:text-emerald-300 border border-slate-200 dark:border-[#222d3e] rounded-lg transition-colors text-slate-700 dark:text-slate-300 text-center"
              >
                Bob (Div B)
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => handleDemoLogin('admin@triad.ai')}
                className="py-1.5 px-2 text-[11px] font-medium bg-slate-50 dark:bg-[#0d1117] hover:bg-[#c4e3de]/40 dark:hover:bg-[#0e6245]/20 hover:text-[#0e6245] dark:hover:text-emerald-300 border border-slate-200 dark:border-[#222d3e] rounded-lg transition-colors text-slate-700 dark:text-slate-300 text-center"
              >
                Admin (Div A)
              </motion.button>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
