import React, { useState, useEffect } from 'react';
import { X, Send, Clock, User, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { Sender, CsvParseResult, CreateCampaignPayload } from '../../types';
import { api } from '../../services/api';
import { toDatetimeLocal } from '../../utils/dateFormat';
import { CsvUploader } from './CsvUploader';
import { useToast } from '../../hooks/useToast';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCampaignCreated?: () => void;
  senders: Sender[];
  onAddSenderClick?: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onCampaignCreated,
  senders,
  onAddSenderClick,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [senderId, setSenderId] = useState('');
  const [startTime, setStartTime] = useState(toDatetimeLocal(new Date(Date.now() + 60000))); // 1 min in future
  const [sendImmediately, setSendImmediately] = useState(true);
  const [delayBetweenEmails, setDelayBetweenEmails] = useState(2); // 2 seconds default
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [parsedCsv, setParsedCsv] = useState<CsvParseResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { showToast } = useToast();

  // Set default sender if available
  useEffect(() => {
    if (senders.length > 0 && !senderId) {
      setSenderId(senders[0].id);
    }
  }, [senders, senderId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!senderId) {
      setErrorMsg('Please select or configure an active sender account.');
      return;
    }

    if (!subject.trim()) {
      setErrorMsg('Subject line is required.');
      return;
    }

    if (!body.trim()) {
      setErrorMsg('Email body is required.');
      return;
    }

    if (!parsedCsv || parsedCsv.validRecipients.length === 0) {
      setErrorMsg('Please upload a CSV/TXT file with at least one valid recipient email.');
      return;
    }

    const payload: CreateCampaignPayload = {
      name: subject.trim().substring(0, 50),
      subject: subject.trim(),
      body: body.trim(),
      senderId,
      startTime: sendImmediately ? undefined : new Date(startTime).toISOString(),
      delayBetweenEmails: Number(delayBetweenEmails),
      hourlyLimit: Number(hourlyLimit),
      recipients: parsedCsv.validRecipients.map((r) => ({
        email: r.email,
        name: r.name,
      })),
    };

    try {
      setSubmitting(true);
      const res = await api.campaigns.create(payload);

      showToast({
        type: 'success',
        title: 'Campaign Scheduled!',
        message: `Successfully scheduled ${res.totalScheduled} emails via BullMQ queue.`,
      });

      // Reset and close
      setSubject('');
      setBody('');
      setParsedCsv(null);
      if (onCampaignCreated) onCampaignCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to schedule campaign');
      showToast({
        type: 'error',
        title: 'Scheduling Failed',
        message: err.message || 'An error occurred while creating the campaign',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Box */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-10 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Compose & Schedule Email</h3>
              <p className="text-xs text-indigo-200">BullMQ delayed queue execution with rate limiting</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Sender Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Sender Account
              </label>
              {onAddSenderClick && (
                <button
                  type="button"
                  onClick={onAddSenderClick}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  + Add New Sender
                </button>
              )}
            </div>

            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                required
              >
                {senders.length === 0 ? (
                  <option value="">No senders found (Please create one)</option>
                ) : (
                  senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email}) — {s.smtpHost}:{s.smtpPort}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Partnership Opportunity / Quick Follow-up"
              className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white placeholder-slate-400"
              required
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Email Body <span className="text-slate-400 font-normal lowercase">(HTML supported)</span>
            </label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello,&#10;&#10;I wanted to reach out regarding our scheduler engine...&#10;&#10;Best,&#10;ReachInbox Team"
              className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white placeholder-slate-400 shadow-xs"
              required
            />
          </div>

          {/* CSV / TXT Upload Section */}
          <CsvUploader onParsed={setParsedCsv} parsedResult={parsedCsv} />

          {/* Scheduling Configuration */}
          <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Dispatch & Rate Limiting Controls</span>
            </h4>

            {/* Start Time Toggle */}
            <div className="space-y-2">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleTimeType"
                    checked={sendImmediately}
                    onChange={() => setSendImmediately(true)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Send Immediately</span>
                </label>

                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleTimeType"
                    checked={!sendImmediately}
                    onChange={() => setSendImmediately(false)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Schedule for Future Date/Time</span>
                </label>
              </div>

              {!sendImmediately && (
                <div className="relative mt-2">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs font-medium border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Delay & Hourly Limit Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Delay Between Emails (Seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={delayBetweenEmails}
                  onChange={(e) => setDelayBetweenEmails(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Staggers each recipient in queue</p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Max Emails Per Hour
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Enforced by Redis atomic token throttle</p>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || (parsedCsv?.validRecipients.length || 0) === 0}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scheduling Batch...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Schedule {parsedCsv ? `${parsedCsv.validRecipients.length} Emails` : 'Campaign'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
