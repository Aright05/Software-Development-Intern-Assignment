import React from 'react';
import { ScheduledEmail } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { TableLoadingSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { formatDateTime, formatRelativeTime } from '../../utils/dateFormat';
import { CheckCircle2, Eye, ExternalLink, Mail } from 'lucide-react';

interface SentEmailsTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
  onSelectEmail: (email: ScheduledEmail) => void;
  onComposeClick?: () => void;
}

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({
  emails,
  loading,
  onSelectEmail,
  onComposeClick,
}) => {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4 text-left">Recipient</th>
              <th className="py-3 px-4 text-left">Subject</th>
              <th className="py-3 px-4 text-left">Sender Account</th>
              <th className="py-3 px-4 text-left">Sent At</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Delivery / Preview</th>
            </tr>
          </thead>
          <TableLoadingSkeleton rows={5} cols={6} />
        </table>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No sent emails yet"
        description="Emails dispatched via BullMQ workers and Nodemailer will appear here along with Ethereal preview links."
        actionText="Schedule First Email"
        onAction={onComposeClick}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
        <thead className="bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
          <tr>
            <th className="py-3.5 px-4">Recipient</th>
            <th className="py-3.5 px-4">Subject</th>
            <th className="py-3.5 px-4">Sender Account</th>
            <th className="py-3.5 px-4">Sent At</th>
            <th className="py-3.5 px-4">Status</th>
            <th className="py-3.5 px-4 text-right">Delivery / Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {emails.map((email) => {
            const previewUrl =
              email.metadata?.previewUrl ||
              (email.metadata && typeof email.metadata === 'object' && 'previewUrl' in email.metadata
                ? email.metadata.previewUrl
                : null);

            return (
              <tr
                key={email.id}
                onClick={() => onSelectEmail(email)}
                className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
              >
                {/* Recipient */}
                <td className="py-3.5 px-4 font-semibold text-slate-900">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate max-w-[180px]">{email.recipient}</span>
                  </div>
                </td>

                {/* Subject */}
                <td className="py-3.5 px-4 text-slate-700">
                  <span className="truncate max-w-[220px] block font-medium">{email.subject}</span>
                </td>

                {/* Sender */}
                <td className="py-3.5 px-4 text-slate-500">
                  <span className="truncate max-w-[140px] block font-mono text-[11px]">
                    {email.sender?.name || email.sender?.email || 'Default Sender'}
                  </span>
                </td>

                {/* Sent At */}
                <td className="py-3.5 px-4 text-slate-600">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">{formatRelativeTime(email.sentAt)}</span>
                    <span className="text-[10px] text-slate-400">{formatDateTime(email.sentAt)}</span>
                  </div>
                </td>

                {/* Status */}
                <td className="py-3.5 px-4">
                  <StatusBadge status={email.status} />
                </td>

                {/* Preview Link / Actions */}
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-semibold transition border border-indigo-200/60 shadow-xs"
                        title="Open Ethereal Email Preview"
                      >
                        <span>Ethereal Preview</span>
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEmail(email);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
