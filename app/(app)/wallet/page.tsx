'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Wallet, PlusCircle, Loader2, ArrowDownCircle, ArrowUpCircle, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { WalletTransaction, WalletTxnType, Provider } from '@/lib/types';

const TXN_TYPES: { value: WalletTxnType; label: string }[] = [
  { value: 'credit', label: 'Credit (Add Funds)' },
  { value: 'debit', label: 'Debit (Withdraw)' },
  { value: 'provider_recharge', label: 'Provider Recharge' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjustment', label: 'Adjustment' },
];

export default function WalletPage() {
  const [transactions, setTransactions] = useState<(WalletTransaction & { provider_name: string | null })[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'credit' as WalletTxnType, amount: '', description: '', providerId: '' });

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: txns }, { data: provs }] = await Promise.all([
      supabase.from('wallet_transactions').select('*, providers(name)').order('created_at', { ascending: false }),
      supabase.from('providers').select('*').order('name'),
    ]);
    setTransactions(
      (txns ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        provider_name: (t.providers as Record<string, unknown>)?.name as string ?? null,
      })) as (WalletTransaction & { provider_name: string | null })[],
    );
    setProviders((provs as Provider[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const balance = transactions.reduce((sum, t) => {
    const isIn = t.type === 'credit' || t.type === 'refund' || t.type === 'adjustment';
    return sum + (isIn ? t.amount_paise : -t.amount_paise);
  }, 0);
  const totalIn = transactions.filter((t) => t.type === 'credit' || t.type === 'refund' || t.type === 'adjustment').reduce((s, t) => s + t.amount_paise, 0);
  const totalOut = transactions.filter((t) => t.type === 'debit' || t.type === 'provider_recharge').reduce((s, t) => s + t.amount_paise, 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.description) { toast.error('Description is required'); return; }

    setSaving(true);
    const supabase = createClient();
    const amountPaise = Math.round(parseFloat(form.amount) * 100);

    const { error } = await supabase.from('wallet_transactions').insert({
      type: form.type, amount_paise: amountPaise,
      description: form.description, provider_id: form.providerId || null,
    });

    if (error) { toast.error('Failed to add transaction'); setSaving(false); return; }

    if (form.type === 'provider_recharge' && form.providerId) {
      const provider = providers.find((p) => p.id === form.providerId);
      if (provider) {
        const newBalance = Math.max(0, Number(provider.balance_paise) - amountPaise);
        await supabase.from('providers').update({
          balance_paise: newBalance, last_balance_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', form.providerId);
        await supabase.from('provider_balance_snapshots').insert({ provider_id: form.providerId, balance_paise: newBalance });
      }
    }

    await supabase.from('activity_logs').insert({
      action: 'wallet_transaction', entity_type: 'wallet',
      detail: `${form.type} of ${formatCurrency(amountPaise)}`,
    });

    toast.success('Transaction added');
    setSaving(false);
    setDialogOpen(false);
    setForm({ type: 'credit', amount: '', description: '', providerId: '' });
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader title="Wallet & Balance" description="Internal personal ledger — no payment processing">
        <Button onClick={() => setDialogOpen(true)} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Entry
        </Button>
      </PageHeader>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
        Internal personal ledger — no payment processing. INR only.
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3">
        <Card className="border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50"><Wallet className="h-4 w-4 text-emerald-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">Current Balance</p>
              <p className="truncate text-xl font-bold text-slate-900">{formatCurrency(balance)}</p>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-slate-200 p-3 shadow-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50"><ArrowDownCircle className="h-4 w-4 text-teal-600" /></div>
            <p className="mt-2 text-xs font-medium text-slate-500">Credits</p>
            <p className="truncate text-base font-bold text-emerald-600">{formatCurrency(totalIn)}</p>
          </Card>
          <Card className="border-slate-200 p-3 shadow-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50"><ArrowUpCircle className="h-4 w-4 text-rose-600" /></div>
            <p className="mt-2 text-xs font-medium text-slate-500">Debits</p>
            <p className="truncate text-base font-bold text-rose-600">{formatCurrency(totalOut)}</p>
          </Card>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {providers.map((p) => (
          <Card key={p.id} className="shrink-0 border-slate-200 p-2.5 shadow-sm" >
            <p className="truncate text-xs font-medium text-slate-500 max-w-[100px]">{p.name}</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(Number(p.balance_paise))}</p>
          </Card>
        ))}
      </div>

      {transactions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-slate-300 bg-slate-50/50 px-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Wallet className="h-6 w-6 text-slate-400" /></div>
          <h3 className="text-base font-semibold text-slate-700">No transactions yet</h3>
          <p className="max-w-xs text-sm text-slate-500">Add your first ledger entry to start tracking funds.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((t) => {
            const isIn = t.type === 'credit' || t.type === 'refund' || t.type === 'adjustment';
            return (
              <Card key={t.id} className="border-slate-200 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Badge variant="outline" className={`text-xs ${isIn ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{t.type}</Badge>
                    <p className="mt-1.5 truncate text-sm text-slate-700">{t.description}</p>
                    <p className="truncate text-xs text-slate-500">{t.provider_name ?? '—'} · {formatDateTime(t.created_at)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isIn ? '+' : '−'}{formatCurrency(t.amount_paise)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Add Ledger Entry</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="txn-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as WalletTxnType })}>
                <SelectTrigger id="txn-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TXN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-amount">Amount (INR)</Label>
              <Input id="txn-amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" step="0.01" />
            </div>
            {form.type === 'provider_recharge' && (
              <div className="space-y-2">
                <Label htmlFor="txn-provider">Provider</Label>
                <Select value={form.providerId} onValueChange={(v) => setForm({ ...form, providerId: v })}>
                  <SelectTrigger id="txn-provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="txn-desc">Description</Label>
              <Textarea id="txn-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this for?" rows={2} />
            </div>
          </form>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={save} disabled={saving} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
