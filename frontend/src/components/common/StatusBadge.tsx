import React from 'react';
import { EmailStatus } from '../../types';
import { Clock, CheckCircle2, AlertTriangle, Loader2, Hourglass, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: EmailStatus | string;
  className?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', showIcon = true }) => {
  const normStatus = (status || '').toUpperCase();

  switch (normStatus) {
    case 'SENT':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm ${className}`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600 flex-shrink-0" />}
          <span>Sent</span>
        </span>
      );

    case 'PROCESSING':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-sm ${className}`}
        >
          {showIcon && <Loader2 className="w-3.5 h-3.5 mr-1.5 text-indigo-600 animate-spin flex-shrink-0" />}
          <span>Processing</span>
        </span>
      );

    case 'SCHEDULED':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-sm ${className}`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 mr-1.5 text-amber-600 flex-shrink-0" />}
          <span>Scheduled</span>
        </span>
      );

    case 'FAILED':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm ${className}`}
        >
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-rose-600 flex-shrink-0" />}
          <span>Failed</span>
        </span>
      );

    case 'CANCELLED':
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm ${className}`}
        >
          {showIcon && <XCircle className="w-3.5 h-3.5 mr-1.5 text-slate-500 flex-shrink-0" />}
          <span>Cancelled</span>
        </span>
      );

    case 'PENDING':
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm ${className}`}
        >
          {showIcon && <Hourglass className="w-3.5 h-3.5 mr-1.5 text-slate-500 flex-shrink-0" />}
          <span>{normStatus || 'Pending'}</span>
        </span>
      );
  }
};
