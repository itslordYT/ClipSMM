'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Settings as SettingsIcon, User, Save, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'PKR', 'BDT'];
const timezones = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka',
  'Asia/Singapore', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'UTC',
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appName, setAppName] = useState('ClipSMM');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: settings } = await supabase.from('app_settings').select('app_name, default_currency, timezone').limit(1).maybeSingle();
      const { data: profile } = await supabase.from('profiles').select('full_name').limit(1).maybeSingle();
      if (profile?.full_name) setFullName(profile.full_name);
      if (settings) {
        setAppName(settings.app_name ?? 'ClipSMM');
        setCurrency(settings.default_currency ?? 'INR');
        setTimezone(settings.timezone ?? 'Asia/Kolkata');
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const { data: existingProfile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
    if (existingProfile) {
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', existingProfile.id);
    } else {
      await supabase.from('profiles').insert({ full_name: fullName });
    }

    const { data: existingSettings } = await supabase.from('app_settings').select('id').limit(1).maybeSingle();
    const payload = { app_name: appName, default_currency: currency, timezone };
    if (existingSettings) {
      await supabase.from('app_settings').update(payload).eq('id', existingSettings.id);
    } else {
      await supabase.from('app_settings').insert(payload);
    }

    toast.success('Settings saved');
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader title="Settings" description="Configure your preferences and profile" />

      <form onSubmit={handleSave} className="space-y-4">
        <Card className="border-slate-200 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-cyan-600" />
            <h2 className="text-base font-semibold text-slate-800">Application</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="app-name">App Name</Label>
              <Input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="ClipSMM" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="border-slate-200 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-cyan-600" />
            <h2 className="text-base font-semibold text-slate-800">Profile</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="full-name">Profile Name</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
        </Card>

        <Button type="submit" disabled={saving} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </form>
    </>
  );
}
