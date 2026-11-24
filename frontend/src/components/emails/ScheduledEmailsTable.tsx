import React from 'react';
import { ScheduledEmail } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { TableLoadingSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { formatDateTime, formatRelativeTime } from '../../utils/dateFormat';
import { Clock, Eye, Mail } from 'lucide-react';

interface ScheduledEmailsTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
  onSelectEmail: (email: ScheduledEmail) => void;
  onComposeClick?: () => void;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({
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
              <th className="py-3 px-4 text-left">Sender</th>
              <th className="py-3 px-4 text-left">Scheduled For</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
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
        icon={Clock}
        title="No scheduled emails in queue"
        description="There are currently no delayed email jobs waiting for execution. Create a campaign to queue emails."
        actionText="Schedule New Email"
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
            <th className="py-3.5 px-4">Scheduled For</th>
            <th className="py-3.5 px-4">Status</th>
            <th className="py-3.5 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {emails.map((email) => (
            <tr
              key={email.id}
              onClick={() => onSelectEmail(email)}
              className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
            >
              {/* Recipient */}
              <td className="py-3.5 px-4 font-semibold text-slate-900">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
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

              {/* Scheduled For */}
              <td className="py-3.5 px-4 text-slate-600">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">{formatRelativeTime(email.scheduledAt)}</span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(email.scheduledAt)}</span>
                </div>
              </td>

              {/* Status */}
              <td className="py-3.5 px-4">
                <StatusBadge status={email.status} />
              </td>

              {/* Actions */}
              <td className="py-3.5 px-4 text-right">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEmail(email);
                  }}
                  className="inline-flex items-center space-x-1 text-slate-500 hover:text-indigo-600 font-semibold p-1.5 rounded-lg hover:bg-indigo-50 transition"
                  title="View Email Details"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="text-[11px]">View</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
