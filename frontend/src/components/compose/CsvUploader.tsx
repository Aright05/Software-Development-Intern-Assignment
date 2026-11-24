import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Copy, Trash2, Eye, EyeOff } from 'lucide-react';
import { CsvParseResult } from '../../types';
import { parseEmailList } from '../../utils/csvParser';

interface CsvUploaderProps {
  onParsed: (result: CsvParseResult | null) => void;
  parsedResult: CsvParseResult | null;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({ onParsed, parsedResult }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [manualInputOpen, setManualInputOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processText = (text: string, name: string = 'Manual input') => {
    const result = parseEmailList(text);
    setFileName(name);
    onParsed(result);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processText(content, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processText(content, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    setFileName(null);
    setManualText('');
    onParsed(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Audience & Leads (CSV / TXT)
        </label>
        <button
          type="button"
          onClick={() => setManualInputOpen(!manualInputOpen)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
        >
          {manualInputOpen ? 'Upload File instead' : 'Or paste text manually'}
        </button>
      </div>

      {!manualInputOpen ? (
        /* Drag & Drop File Upload Box */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01]'
              : parsedResult
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                parsedResult ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
              }`}
            >
              {parsedResult ? <FileText className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800">
                {fileName ? fileName : 'Click to upload or drag & drop'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Supports CSV (with email column) or TXT files (one address per line)
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Manual Textarea Input */
        <div className="space-y-2">
          <textarea
            rows={4}
            value={manualText}
            onChange={(e) => {
              setManualText(e.target.value);
              processText(e.target.value, 'Pasted Text');
            }}
            placeholder="paste emails here, separated by commas, newlines, or semicolons:&#10;alice@example.com&#10;bob@example.com, Bob Smith"
            className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white placeholder-slate-400 shadow-xs"
          />
        </div>
      )}

      {/* Parse Results Summary Pills */}
      {parsedResult && (
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                <span>{parsedResult.validRecipients.length} Valid Leads</span>
              </span>

              {parsedResult.duplicateCount > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <Copy className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  <span>{parsedResult.duplicateCount} Duplicates Filtered</span>
                </span>
              )}

              {parsedResult.invalidCount > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                  <span>{parsedResult.invalidCount} Invalid Skipped</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-slate-200/60 transition"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? 'Hide Preview' : 'Preview Leads'}</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition"
                title="Remove imported file"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Preview Leads Table */}
          {showPreview && (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-xs">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Recipient Email</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedResult.recipients.slice(0, 50).map((r, i) => (
                    <tr key={r.id} className={r.valid ? 'hover:bg-slate-50' : 'bg-rose-50/40'}>
                      <td className="py-1.5 px-3 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                      <td className="py-1.5 px-3 font-medium text-slate-800">{r.email}</td>
                      <td className="py-1.5 px-3 text-slate-500">{r.name || '—'}</td>
                      <td className="py-1.5 px-3 text-right">
                        {r.valid ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Ready
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 truncate max-w-[120px] inline-block"
                            title={r.error}
                          >
                            {r.error || 'Invalid'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedResult.recipients.length > 50 && (
                <div className="py-2 text-center text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100 font-medium">
                  Showing first 50 of {parsedResult.recipients.length} leads
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
