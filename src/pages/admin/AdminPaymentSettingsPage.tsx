import React, { useEffect, useState } from 'react';
import { R2_BASE, putPublicJson } from '../../services/jobsStore';
import { PaymentSettings } from '../../types';
import { invalidateCache } from '../../services/cache';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';
import { Settings, Save, ShieldCheck, MessageCircle } from 'lucide-react';

const DEFAULT_INSTRUCTIONS =
  'bKash, Rocket বা Nagad অ্যাপ থেকে Send Money করুন এবং Reference-এ আপনার আবেদন আইডি দিন।';

export const AdminPaymentSettingsPage: React.FC = () => {
  const [bkashNumber, setBkashNumber] = useState('01704368053');
  const [rocketNumber, setRocketNumber] = useState('01771522503');
  const [nagadNumber, setNagadNumber] = useState('01771522503');
  const [whatsappNumber, setWhatsappNumber] = useState('01704368053');
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // R2 থেকে পড়া (Firestore লাগে না)। ফাইল না থাকলে ডিফল্ট মান থাকবে।
        const res = await fetch(`${R2_BASE}/settings-payment.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as PaymentSettings;
          setBkashNumber(data.bkashNumber || '01704368053');
          setRocketNumber(data.rocketNumber || '01771522503');
          setNagadNumber(data.nagadNumber || '01771522503');
          setWhatsappNumber(data.whatsappNumber || '01704368053');
          setInstructions(data.instructions || DEFAULT_INSTRUCTIONS);
        }
      } catch {
        // Silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await putPublicJson('settings-payment', {
        bkashNumber: bkashNumber.trim(),
        rocketNumber: rocketNumber.trim(),
        nagadNumber: nagadNumber.trim(),
        whatsappNumber: whatsappNumber.trim(),
        instructions: instructions.trim(),
        updatedAt: new Date().toISOString(),
      });
      invalidateCache('settings_');
      success('পেমেন্ট ও যোগাযোগ সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
    } catch (err: any) {
      console.error('Settings save error:', err);
      error(err?.message || 'সেটিংস সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spinner size="lg" text="সেটিংস লোড হচ্ছে..." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">পেমেন্ট ও হেল্পলাইন সেটিংস</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          ইউজার পেমেন্ট পেজে প্রদর্শিত bKash/Rocket নম্বর ও WhatsApp হেল্পলাইন কনফিগার করুন
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-5">
        <Input
          label="bKash পার্সোনাল নম্বর"
          placeholder="017XXXXXXXX (Personal)"
          value={bkashNumber}
          onChange={(e) => setBkashNumber(e.target.value)}
          requiredStar
        />

        <Input
          label="Rocket পার্সোনাল নম্বর"
          placeholder="019XXXXXXXXX (Personal)"
          value={rocketNumber}
          onChange={(e) => setRocketNumber(e.target.value)}
          requiredStar
        />

        <Input
          label="Nagad পার্সোনাল নম্বর"
          placeholder="017XXXXXXXX (Personal)"
          value={nagadNumber}
          onChange={(e) => setNagadNumber(e.target.value)}
          requiredStar
        />

        <Input
          label="অফিসিয়াল WhatsApp হেল্পলাইন নম্বর"
          placeholder="017XXXXXXXX"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          helperText="প্রার্থীদের সাথে দ্রুত চ্যাটের জন্য ব্যবহৃত হবে"
          requiredStar
        />

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">
            পেমেন্ট নির্দেশনা ও রেফারেন্স নিয়মাবলী
          </label>
          <textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="ইউজারকে কীভাবে টাকা পাঠাতে হবে তার নিয়ম লিখুন..."
            className="w-full p-3 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="pt-2">
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            সেটিংস সেভ করুন
          </Button>
        </div>
      </form>
    </div>
  );
};
