import React, { useEffect, useState } from 'react';
import { auth } from '../../services/firebase';
import { WORKER_URL } from '../../services/jobsStore';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useToast } from '../common/Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  app: any | null;
  onSaved?: (id: string, data: { teletalkUser: string; teletalkPassword: string }) => void;
}

export const TeletalkCredentialsModal: React.FC<Props> = ({ isOpen, onClose, app, onSaved }) => {
  const [teletalkUser, setTeletalkUser] = useState('');
  const [teletalkPassword, setTeletalkPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  // মডাল খুললে আগের মান দেখানো
  useEffect(() => {
    if (isOpen && app) {
      setTeletalkUser(app.teletalkUser || '');
      setTeletalkPassword(app.teletalkPassword || '');
    }
  }, [isOpen, app]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app) return;
    if (!teletalkUser.trim() || !teletalkPassword.trim()) {
      error('ইউজার ও পাসওয়ার্ড দুটিই লিখুন');
      return;
    }

    setSaving(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('লগইন প্রয়োজন');
      const token = await u.getIdToken();

      const data = {
        teletalkUser: teletalkUser.trim(),
        teletalkPassword: teletalkPassword.trim(),
        teletalkSavedAt: new Date().toISOString(),
      };

      const res = await fetch(`${WORKER_URL}/api/admin/applications/${encodeURIComponent(app.id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error(`সেভ ব্যর্থ (HTTP ${res.status})`);

      onSaved?.(app.id, { teletalkUser: data.teletalkUser, teletalkPassword: data.teletalkPassword });
      success('Teletalk তথ্য সেভ হয়েছে। প্রার্থী তার আবেদন পাতায় দেখতে পাবেন।');
      onClose();
    } catch (err: any) {
      error(err?.message || 'সেভ করতে সমস্যা হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Teletalk তথ্য (${app?.id || ''})`}>
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          সফট কপি দেওয়ার সময় প্রার্থীর Teletalk ইউজার (Application/Username) লিখুন। টাকা পরিশোধের পর SMS-এ পাওয়া পাসওয়ার্ড লিখুন। প্রার্থী তার আবেদন পাতায় এগুলো দেখবেন।
        </p>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Teletalk ইউজার</label>
          <input
            type="text"
            value={teletalkUser}
            onChange={(e) => setTeletalkUser(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Teletalk পাসওয়ার্ড (SMS থেকে)</label>
          <input
            type="text"
            value={teletalkPassword}
            onChange={(e) => setTeletalkPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            বাতিল
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            সেভ করুন
          </Button>
        </div>
      </form>
    </Modal>
  );
};
