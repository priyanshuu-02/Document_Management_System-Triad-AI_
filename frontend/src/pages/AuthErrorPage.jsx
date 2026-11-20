// Shown when someone opens a page they don't have permission for.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, ArrowLeft, LogOut, Building2, User } from 'lucide-react';

export default function AuthErrorPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-rose-100 dark:border-rose-950/60 p-8 shadow-xl text-center space-y-6 transition-colors">
        
        {/* Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm shadow-rose-500/10">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Header */}
        <div className="space-y-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
            403 • Access Denied
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Admin Privileges Required
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            You do not have the required permissions to access this administrative console. Direct URL navigation to this page is blocked by Role-Based Access Control (RBAC).
          </p>
        </div>

        {/* Current Identity Details */}
        {user && (
          <div className="bg-slate-50 dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80 text-left text-xs space-y-2 transition-colors">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center space-x-1.5 font-medium">
                <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>Signed In As:</span>
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">{user.username} ({user.email})</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center space-x-1.5 font-medium">
                <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>Division:</span>
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">{user.division}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span className="font-medium">Assigned Role:</span>
              <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 uppercase text-[10px]">
                {user.role} (Restricted)
              </span>
            </div>
          </div>
        )}

        {/* Navigation Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 inline-flex items-center justify-center space-x-2 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all shadow-teal-500/20"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Document Hub</span>
          </button>
          
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="inline-flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
          >
            <LogOut className="w-4 h-4" />
            <span>Switch Account</span>
          </button>
        </div>

      </div>
    </div>
  );
}
