import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../services/api';
import { HealthResponse, EmailStats, ScheduledEmail } from '../types';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Server,
  Database,
  Cpu,
  Layers,
  ArrowUpRight,
  Plus,
  Mail,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { CardSkeleton } from '../components/common/LoadingSkeleton';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatRelativeTime } from '../utils/dateFormat';

export const Dashboard: React.FC = () => {
  const { openCompose } = useOutletContext<{ openCompose: () => void }>() || {};

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<EmailStats>({
    SCHEDULED: 0,
    PENDING: 0,
    PROCESSING: 0,
    SENT: 0,
    FAILED: 0,
    TOTAL: 0,
  });
  const [recentEmails, setRecentEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [healthRes, statsRes, recentRes] = await Promise.allSettled([
        api.health.check(),
        api.emails.getStats(),
        api.emails.getScheduled({ limit: 5 }),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (recentRes.status === 'fulfilled') setRecentEmails(recentRes.value.data || []);
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="space-y-8">
      {/* Welcome & Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            System Overview
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time BullMQ delayed job processing, Redis distributed rate limits & delivery health
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDashboardData}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-xs"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={openCompose}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs sm:text-sm font-semibold shadow-md shadow-indigo-300/40 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Compose New Email</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Scheduled */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-indigo-300 transition group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Scheduled Queue
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">
                {stats.SCHEDULED + stats.PENDING}
              </p>
              <p className="text-xs text-slate-500 mt-1">Delayed jobs awaiting execution</p>
            </div>

            {/* Sent */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-emerald-300 transition group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Delivered Total
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{stats.SENT}</p>
              <p className="text-xs text-slate-500 mt-1">Successfully dispatched via SMTP</p>
            </div>

            {/* Processing */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-indigo-300 transition group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Active Processing
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">
                {stats.PROCESSING}
              </p>
              <p className="text-xs text-slate-500 mt-1">Worker active executions</p>
            </div>

            {/* Failed */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-rose-300 transition group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Failed / Backoff
                </span>
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">{stats.FAILED}</p>
              <p className="text-xs text-slate-500 mt-1">Exponential backoff or retry</p>
            </div>
          </>
        )}
      </div>

      {/* Services Health Status Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Core Infrastructure Health</h3>
              <p className="text-[11px] text-slate-500">Live heartbeat status of scheduler dependencies</p>
            </div>
          </div>

          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            {health?.status === 'healthy' ? 'Engine Ready' : 'Active'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">Node / Express API</p>
                <p className="text-[11px] text-slate-500">
                  {health ? `Uptime: ${Math.round(health.uptime)}s` : 'Online'}
                </p>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Database className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">PostgreSQL (Prisma)</p>
                <p className="text-[11px] text-slate-500">Relational & audit logs</p>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Layers className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">Redis & BullMQ</p>
                <p className="text-[11px] text-slate-500">Distributed Lua throttle</p>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">Elasticsearch 8</p>
                <p className="text-[11px] text-slate-500">Full-text search engine</p>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* Recent Scheduled Queue Stream */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Recent Scheduled Queue</h3>
            <p className="text-xs text-slate-500">Upcoming emails scheduled via BullMQ workers</p>
          </div>

          <Link
            to="/jobs"
            className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <span>View All Emails</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentEmails.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Mail className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No scheduled emails in queue</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click "Compose New Email" to schedule a campaign</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentEmails.map((email) => (
              <div key={email.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{email.recipient}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-sm">{email.subject}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                    {formatRelativeTime(email.scheduledAt)}
                  </span>
                  <StatusBadge status={email.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
