import React, { useState } from 'react';
import { X, Send, ExternalLink, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Sender, TestEmailPayload } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';

interface TestEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: Sender[];
}

export const TestEmailModal: React.FC<TestEmailModalProps> = ({ isOpen, onClose, senders }) => {
  const [recipient, setRecipient] = useState('ethereal.test@reachinbox.ai');
  const [subject, setSubject] = useState('ReachInbox SMTP Verification Test');
  const [body, setBody] = useState(
    '<h3>ReachInbox Ethereal SMTP Test</h3><p>This email confirms real SMTP transmission via Nodemailer.</p>'
  );
  const [senderId, setSenderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ previewUrl: string | false; messageId: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);

    const payload: TestEmailPayload = {
      recipient: recipient.trim(),
      subject: subject.trim(),
      body: body.trim(),
      senderId: senderId || undefined,
    };

    try {
      setSubmitting(true);
      const res = await api.emails.sendTest(payload);

      setResult({
        previewUrl: res.data.previewUrl,
        messageId: res.data.messageId,
      });

      showToast({
        type: 'success',
        title: 'Test Email Dispatched!',
        message: 'Successfully delivered through Nodemailer SMTP.',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch test email');
      showToast({
        type: 'error',
        title: 'Transmission Failed',
        message: err.message || 'Error dispatching test email',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 z-10 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Send Test Email</h3>
              <p className="text-[11px] text-slate-400">Verify SMTP delivery & generate Ethereal preview</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start space-x-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {result && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
              <div className="flex items-center space-x-2 font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Email Delivered Successfully!</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-mono">Message ID: {result.messageId}</p>
              {result.previewUrl && (
                <div className="pt-2">
                  <a
                    href={result.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-xs hover:bg-emerald-700 transition"
                  >
                    <span>View in Ethereal Mail</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Select Sender
            </label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="">Default Ethereal Account</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Recipient Email
            </label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Body HTML
            </label>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 font-mono"
              required
            />
          </div>

          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Close
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Immediate Test</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
