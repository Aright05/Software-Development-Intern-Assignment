import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Database,
  Plus,
} from 'lucide-react';
import { ScheduledEmail, PaginationMeta } from '../types';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { ScheduledEmailsTable } from '../components/emails/ScheduledEmailsTable';
import { SentEmailsTable } from '../components/emails/SentEmailsTable';
import { EmailDetailModal } from '../components/emails/EmailDetailModal';
import { Pagination } from '../components/common/Pagination';
import { useToast } from '../hooks/useToast';

type ActiveTab = 'scheduled' | 'sent';

export const JobHistory: React.FC = () => {
  const { openCompose } = useOutletContext<{ openCompose: () => void }>() || {};

  const [activeTab, setActiveTab] = useState<ActiveTab>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [sentEmails, setSentEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<ScheduledEmail | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 350);
  const [statusFilter, setStatusFilter] = useState('');
  const [reindexing, setReindexing] = useState(false);
  const [searchSource, setSearchSource] = useState<string | null>(null);

  // Pagination states
  const [scheduledMeta, setScheduledMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [sentMeta, setSentMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const { showToast } = useToast();

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);

      if (debouncedSearch.trim()) {
        // Run full-text search via Elasticsearch
        const searchRes = await api.emails.search({
          q: debouncedSearch.trim(),
          status: statusFilter || undefined,
          page: activeTab === 'scheduled' ? scheduledMeta.page : sentMeta.page,
          limit: 15,
        });

        const hits = searchRes.data || [];
        setSearchSource(searchRes.source || 'elasticsearch');

        if (activeTab === 'scheduled') {
          setScheduledEmails(hits.filter((e) => e.status !== 'SENT'));
          if (searchRes.pagination) setScheduledMeta(searchRes.pagination);
        } else {
          setSentEmails(hits.filter((e) => e.status === 'SENT'));
          if (searchRes.pagination) setSentMeta(searchRes.pagination);
        }
      } else {
        setSearchSource(null);
        // Regular paginated query
        if (activeTab === 'scheduled') {
          const res = await api.emails.getScheduled({
            page: scheduledMeta.page,
            limit: scheduledMeta.limit,
            search: undefined,
          });
          setScheduledEmails(res.data || []);
          if (res.pagination) setScheduledMeta(res.pagination);
        } else {
          const res = await api.emails.getSent({
            page: sentMeta.page,
            limit: sentMeta.limit,
            search: undefined,
          });
          setSentEmails(res.data || []);
          if (res.pagination) setSentMeta(res.pagination);
        }
      }
    } catch (err: any) {
      console.error('Fetch emails error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, statusFilter, scheduledMeta.page, sentMeta.page]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleReindex = async () => {
    try {
      setReindexing(true);
      const res = await api.emails.reindex();
      showToast({
        type: 'success',
        title: 'Elasticsearch Reindexed',
        message: res.message || 'Indexed records refreshed.',
      });
      fetchEmails();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Reindexing Error',
        message: err.message || 'Failed to reindex Elasticsearch',
      });
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Emails Hub</h2>
            {searchSource && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                via {searchSource === 'elasticsearch' ? 'Elasticsearch' : 'DB Fallback'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time BullMQ scheduled queue, delivered audits & full-text search
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
            title="Sync PostgreSQL with Elasticsearch"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>{reindexing ? 'Reindexing...' : 'Reindex ES'}</span>
          </button>

          <button
            onClick={openCompose}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Compose Email</span>
          </button>
        </div>
      </div>

      {/* Main Card with Tabs, Search & Tables */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200/80 px-4 sm:px-6 pt-3 gap-3">
          {/* Tabs */}
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'scheduled'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Scheduled Emails</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeTab === 'scheduled' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {scheduledMeta.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sent')}
              className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'sent'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Sent Emails</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeTab === 'sent' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {sentMeta.total}
              </span>
            </button>
          </div>

          {/* Search & Status Filters */}
          <div className="flex items-center space-x-2.5 pb-3 sm:pb-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recipient, subject, body..."
                className="pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500 w-44 sm:w-60 transition"
              />
            </div>

            <div className="relative hidden md:block">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PROCESSING">Processing</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            <button
              onClick={fetchEmails}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Content Tables */}
        {activeTab === 'scheduled' ? (
          <ScheduledEmailsTable
            emails={scheduledEmails}
            loading={loading}
            onSelectEmail={setSelectedEmail}
            onComposeClick={openCompose}
          />
        ) : (
          <SentEmailsTable
            emails={sentEmails}
            loading={loading}
            onSelectEmail={setSelectedEmail}
            onComposeClick={openCompose}
          />
        )}

        {/* Pagination Bar */}
        <Pagination
          meta={activeTab === 'scheduled' ? scheduledMeta : sentMeta}
          onPageChange={(newPage) => {
            if (activeTab === 'scheduled') {
              setScheduledMeta((prev) => ({ ...prev, page: newPage }));
            } else {
              setSentMeta((prev) => ({ ...prev, page: newPage }));
            }
          }}
        />
      </div>

      {/* Email Detail Inspection Modal */}
      <EmailDetailModal
        email={selectedEmail}
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
};
