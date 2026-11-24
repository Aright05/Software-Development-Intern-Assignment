import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Plus,
  ShieldCheck,
  MessageSquare,
  CheckCircle,
  X,
  BellRing,
  Mail,
  Loader2,
} from 'lucide-react';
import { Sender, SlackStatus } from '../types';
import { api } from '../services/api';
import { CreateSenderModal } from '../components/senders/CreateSenderModal';
import { TestEmailModal } from '../components/senders/TestEmailModal';
import { useToast } from '../hooks/useToast';
import { formatDateTime } from '../utils/dateFormat';

export const Senders: React.FC = () => {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  const { showToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [sendersRes, slackRes] = await Promise.allSettled([
        api.senders.list(),
        api.slack.getStatus(),
      ]);

      if (sendersRes.status === 'fulfilled') {
        setSenders(sendersRes.value);
      }
      if (slackRes.status === 'fulfilled') {
        setSlackStatus(slackRes.value);
      }
    } catch (err: any) {
      console.error('Error fetching senders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle URL query parameters for Slack callback notification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      showToast({
        type: 'success',
        title: 'Slack Connected!',
        message: `Successfully connected ${params.get('team') || 'workspace'} for rate limit alerts.`,
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchData();
    }
  }, [showToast, fetchData]);

  const handleSlackConnect = () => {
    window.location.href = api.slack.getConnectUrl();
  };

  const handleSlackDisconnect = async () => {
    try {
      await api.slack.disconnect();
      showToast({
        type: 'info',
        title: 'Slack Disconnected',
        message: 'Your Slack workspace has been disconnected.',
      });
      fetchData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to disconnect Slack',
      });
    }
  };

  const handleTestSlackNotification = async () => {
    try {
      setTestingSlack(true);
      const message = await api.slack.sendTestNotification();
      showToast({
        type: 'success',
        title: 'Notification Sent',
        message: message || 'Test alert dispatched to Slack channel.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Notification Failed',
        message: err.message || 'Failed to dispatch Slack notification',
      });
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Senders & Integrations</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage multiple outbound SMTP accounts and Slack notification webhooks
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setTestModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
          >
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span>Send Test Email</span>
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sender Account</span>
          </button>
        </div>
      </div>

      {/* Slack Integration Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-[#4A154B]/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-6 h-6 text-[#E01E5A]" />
            </div>

            <div>
              <div className="flex items-center space-x-2.5">
                <h3 className="text-base font-bold text-slate-900">Slack Notifications</h3>
                {slackStatus?.connected ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    Disconnected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                Receive real-time Slack channel notifications whenever a sender reaches its hourly limit
                or encounters throttled jobs, preventing unexpected delivery blocks.
              </p>

              {slackStatus?.connected && slackStatus.teamName && (
                <div className="mt-2 text-xs text-slate-600 font-medium">
                  Connected workspace: <span className="font-bold text-slate-900">{slackStatus.teamName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-start md:self-center">
            {slackStatus?.connected ? (
              <>
                <button
                  onClick={handleTestSlackNotification}
                  disabled={testingSlack}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  {testingSlack ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BellRing className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>Test Notification</span>
                </button>

                <button
                  onClick={handleSlackDisconnect}
                  className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSlackConnect}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#4A154B] hover:bg-[#611f69] text-white text-xs font-semibold shadow-sm transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Connect Slack Workspace</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Senders List Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Active Sender Accounts ({senders.length})
          </h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="animate-pulse bg-white p-6 rounded-2xl border border-slate-200 h-32" />
            <div className="animate-pulse bg-white p-6 rounded-2xl border border-slate-200 h-32" />
          </div>
        ) : senders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No sender accounts configured</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add your first SMTP sender to begin scheduling and dispatching email campaigns.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add Sender Account</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {senders.map((sender) => (
              <div
                key={sender.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-indigo-300 hover:shadow-md transition space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                      {sender.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" />
                      Active
                    </span>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">{sender.name}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">{sender.email}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Host:</span>
                    <span className="font-mono text-slate-700">{sender.smtpHost}:{sender.smtpPort}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Dispatches:</span>
                    <span className="font-semibold text-slate-900">
                      {sender._count?.scheduledEmails || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                    <span>Created:</span>
                    <span>{formatDateTime(sender.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateSenderModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSenderCreated={fetchData}
      />

      <TestEmailModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        senders={senders}
      />
    </div>
  );
};
