import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, ShieldCheck, X } from 'lucide-react';

export const MASTER_SECURITY_PASSWORD = 'MightY99/.1234';

interface SecurityPasswordModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  actionButtonText?: string;
  isDestructive?: boolean;
  onConfirm: (password: string) => Promise<boolean | void> | void;
  onClose: () => void;
}

export const SecurityPasswordModal: React.FC<SecurityPasswordModalProps> = ({
  isOpen,
  title,
  description,
  actionButtonText = 'Authorize & Proceed',
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setIsSubmitting(false);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    if (password !== MASTER_SECURITY_PASSWORD) {
      setError('Incorrect security password. Access denied.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(password);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden">
        {/* Top colored accent strip */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isDestructive ? 'bg-rose-600' : 'bg-amber-500'}`} />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start space-x-3.5 mb-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDestructive ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
          }`}>
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Security Authorization Password</span>
              <span className="text-[10px] text-slate-400 font-normal">Protected Action</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter password to authorize"
                autoFocus
                disabled={isSubmitting}
                className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs text-slate-900 pr-10 focus:outline-none focus:ring-2 font-mono transition ${
                  error
                    ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                    : 'border-slate-300 focus:ring-blue-500 focus:bg-white'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <div className="flex items-center space-x-1.5 text-rose-600 text-xs mt-1.5 font-medium animate-in fade-in duration-150">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Master administrative verification is required to safeguard fleet integrity.</span>
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Verifying...' : actionButtonText}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
