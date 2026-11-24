import React from 'react';
import { X, Mail, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { ScheduledEmail } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatDateTime } from '../../utils/dateFormat';

interface EmailDetailModalProps {
  email: ScheduledEmail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, isOpen, onClose }) => {
  if (!isOpen || !email) return null;

  const previewUrl =
    email.metadata?.previewUrl ||
    (email.metadata && typeof email.metadata === 'object' && 'previewUrl' in email.metadata
      ? email.metadata.previewUrl
      : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-10 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Email Job Audit</h3>
              <p className="text-[11px] text-slate-400 font-mono">ID: {email.id}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Status & Preview Bar */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
              <StatusBadge status={email.status} />
            </div>

            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
              >
                <span>View in Ethereal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Recipient
              </span>
              <span className="font-semibold text-slate-900 font-mono">{email.recipient}</span>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Sender Account
              </span>
              <span className="font-semibold text-slate-900 font-mono">
                {email.sender?.name || email.sender?.email || 'System Default'}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Scheduled Execution
              </span>
              <span className="text-slate-700 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDateTime(email.scheduledAt)}</span>
              </span>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Sent Confirmation
              </span>
              <span className="text-slate-700 flex items-center space-x-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>{email.sentAt ? formatDateTime(email.sentAt) : 'Not sent yet'}</span>
              </span>
            </div>
          </div>

          {/* Error Message if Failed */}
          {email.errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Failure Details:</span>
              </div>
              <p className="font-mono text-[11px]">{email.errorMessage}</p>
            </div>
          )}

          {/* Subject Line */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Subject Line
            </span>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
              {email.subject}
            </div>
          </div>

          {/* Email Body Preview */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Email Body
            </span>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {email.body}
            </div>
          </div>

          {/* Technical Metadata */}
          <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px] font-mono text-slate-500">
            <div className="flex justify-between">
              <span>BullMQ Job ID:</span>
              <span className="text-slate-700">{email.bullJobId || 'Pending'}</span>
            </div>
            <div className="flex justify-between">
              <span>Idempotency Key:</span>
              <span className="text-slate-700 truncate max-w-[280px]">{email.idempotencyKey}</span>
            </div>
            {email.attempts !== undefined && (
              <div className="flex justify-between">
                <span>Worker Attempts:</span>
                <span className="text-slate-700">
                  {email.attempts} / {email.maxAttempts || 3}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
