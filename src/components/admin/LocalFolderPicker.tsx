import React, { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  pickAutofillFolder,
  ensureFolderPermission,
  hasSavedFolder,
  isFolderPickerSupported,
} from '../../services/localMedia';

type Status = 'checking' | 'ready' | 'need-permission' | 'none' | 'unsupported';

export const LocalFolderPicker: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    if (!isFolderPickerSupported()) {
      setStatus('unsupported');
      return;
    }
    if (await ensureFolderPermission(false)) {
      setStatus('ready');
      return;
    }
    setStatus((await hasSavedFolder()) ? 'need-permission' : 'none');
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handlePick = async () => {
    setBusy(true);
    try {
      await pickAutofillFolder();
      await refreshStatus();
      onChanged();
    } catch {
      // ব্যবহারকারী বাতিল করলে কিছু করার নেই
    } finally {
      setBusy(false);
    }
  };

  const handlePermission = async () => {
    setBusy(true);
    try {
      await ensureFolderPermission(true);
      await refreshStatus();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (status === 'checking') return null;

  if (status === 'unsupported') {
    return (
      <div className="p-2.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-xs">
        ফোল্ডার থেকে ছবি-স্বাক্ষর পড়ার সুবিধা শুধু ডেস্কটপ Chrome বা Edge-এ আছে।
      </div>
    );
  }

  return (
    <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2">
      <span className="text-sky-900">
        {status === 'ready' && '✓ ছবি-স্বাক্ষরের ফোল্ডার যুক্ত আছে'}
        {status === 'need-permission' && 'ফোল্ডারের অনুমতি দিতে হবে'}
        {status === 'none' && 'ছবি-স্বাক্ষরের ফোল্ডার নির্বাচন করুন (একবার)'}
      </span>
      {status === 'ready' ? (
        <button
          type="button"
          disabled={busy}
          onClick={handlePick}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-sky-300 rounded-md font-semibold text-sky-800"
        >
          <FolderOpen className="w-3.5 h-3.5" /> ফোল্ডার বদলান
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={status === 'need-permission' ? handlePermission : handlePick}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md font-semibold"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {status === 'need-permission' ? 'অনুমতি দিন' : 'ফোল্ডার নির্বাচন করুন'}
        </button>
      )}
    </div>
  );
};
