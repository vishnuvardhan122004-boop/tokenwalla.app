/**
 * components/StaffIncentive.tsx — the staff incentive (ROADMAP 60) on the
 * hospital's Payments screen, and the one-line card on its dashboard.
 *
 * The app's counterpart of src/hospital/StaffIncentiveDashboard.js, the payee
 * block of HPayments.js and StaffIncentiveCard.js on the website. TokenWalla
 * pays one front-desk person per hospital a fixed amount per paid, completed
 * booking; the hospital only says who and how often. Every figure comes from
 * GET /hospitals/<id>/incentive/ — nothing is added up or priced here, and no
 * amount is ever sent.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';
import API from '../services/api';
import { tenDigitMobile } from '../utils/phone';
import { UPI_RE } from '../utils/payout';

type Totals = {
  enabled: boolean;
  per_booking: string;
  month_count: number;
  month_amount: string;
  unpaid_amount: string;
  paid_total: string;
  payee_set: boolean;
  payee_name: string;
  frequency: string;
  next_payout_date: string | null;
  daily: { date: string; count: number; amount: string }[];
  payments: { paid_at: string; utr: string; count: number; amount: string }[];
};

// The same three choices as the website's CYCLES.
const CYCLES = [
  { value: 'WEEKLY',       label: 'Weekly' },
  { value: 'FIFTEEN_DAYS', label: 'Every 15 days' },
  { value: 'MONTHLY',      label: 'Monthly' },
];

const MOBILE_RE = /^[6-9]\d{9}$/;
// Always two decimals, like the website: the figures are multiples of ₹4.75.
const inr = (v?: string | number) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The running totals, or null while the flag is off / unreadable: this is an
 *  extra, so a failed read shows nothing rather than a number it isn't sure of. */
function useTotals(hospitalId: number | string, refreshKey = 0) {
  const [t, setT] = useState<Totals | null>(null);
  useEffect(() => {
    let live = true;
    API.get(`/hospitals/${hospitalId}/incentive/`)
      .then(({ data }) => { if (live) setT(data); })
      .catch(() => {});
    return () => { live = false; };
  }, [hospitalId, refreshKey]);
  return t;
}

export function StaffIncentiveCard({ hospitalId, onOpen }: { hospitalId: number | string; onOpen: () => void }) {
  const t = useTotals(hospitalId);
  if (!t || !t.enabled) return null;
  return (
    <View style={styles.card}>
      {t.payee_set ? (
        <Text style={styles.cardText}>
          {`Staff incentive: ${inr(t.month_amount)} this month (${t.month_count} booking${t.month_count === 1 ? '' : 's'}) · ${inr(t.unpaid_amount)} waiting to be paid `}
          <Text style={styles.link} onPress={onOpen}>See details</Text>
        </Text>
      ) : (
        <Text style={styles.cardText}>
          {/* With the flag on, a hospital with no UPI still earns: its bookings
              wait and are paid once a UPI is saved (the API's run_daily_payouts). */}
          {'Staff incentive: bookings still count. '}
          <Text style={styles.link} onPress={onOpen}>Add a UPI in Payments so we can pay it</Text>
        </Text>
      )}
    </View>
  );
}

export default function StaffIncentive({ hospitalId }: { hospitalId: number | string }) {
  const [dashKey, setDashKey] = useState(0);   // reload the figures after a save
  const t = useTotals(hospitalId, dashKey);

  const [payee, setPayee] = useState({ name: '', upi: '', phone: '', frequency: 'MONTHLY' });
  const [error, setError] = useState<{ upi?: string; phone?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    API.get(`/hospitals/${hospitalId}/payment-details/`)
      .then(({ data }) => setPayee({
        name: data.incentive_name || '', upi: data.incentive_upi || '',
        phone: data.incentive_phone || '', frequency: data.incentive_frequency || 'MONTHLY',
      }))
      .catch(() => {});   // the block just starts empty; saving still works
  }, [hospitalId]);

  const save = useCallback(async () => {
    const upi = payee.upi.trim();
    const phone = payee.phone.trim();
    const bad: { upi?: string; phone?: string } = {};
    if (upi && !UPI_RE.test(upi)) bad.upi = 'Enter a valid UPI ID (e.g. name@bank).';
    if (phone && !MOBILE_RE.test(phone)) bad.phone = 'Enter a valid 10-digit mobile number.';
    setError(bad);
    setSaved(false);
    if (bad.upi || bad.phone) return;
    setSaving(true);
    try {
      await API.put(`/hospitals/${hospitalId}/payment-details/`, {
        incentive_name:      payee.name.trim(),
        incentive_upi:       upi,
        incentive_phone:     phone,
        incentive_frequency: payee.frequency,
      });
      setSaved(true);
      setDashKey(k => k + 1);
    } catch (e: any) {
      const errs = e?.response?.data?.errors || {};
      const one = (v: unknown) => (v ? (Array.isArray(v) ? String(v[0]) : String(v)) : undefined);
      const fromServer = { upi: one(errs.incentive_upi), phone: one(errs.incentive_phone) };
      setError(fromServer.upi || fromServer.phone
        ? fromServer
        : { general: e?.response?.data?.message || 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }, [hospitalId, payee]);

  const cycle = CYCLES.find(c => c.value === t?.frequency) || CYCLES[2];
  const tiles = t && [
    { label: 'This month', val: inr(t.month_amount), sub: `${t.month_count} booking${t.month_count === 1 ? '' : 's'}`, color: Colors.successText },
    { label: 'Waiting to be paid', val: inr(t.unpaid_amount), sub: 'Earned, not yet sent', color: Colors.warningText },
    { label: 'Paid so far', val: inr(t.paid_total), sub: 'Sent to the UPI', color: Colors.blue400 },
    { label: 'Next payout', val: day(t.next_payout_date), sub: `${cycle.label} cycle`, color: Colors.blue600 },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🎁 Staff incentive</Text>

      {t && !t.enabled && (
        <Text style={styles.muted}>
          The staff incentive is not switched on yet. Once it is, this page shows what your front
          desk earns, what is waiting and what has been paid.
        </Text>
      )}

      {t && t.enabled && tiles && (
        <>
          <Text style={styles.muted}>
            {t.payee_set
              ? `Paid to ${t.payee_name || 'your staff payee'}.`
              : 'Add a UPI below so we can pay it. Bookings completed before then still count: they show here once a UPI is saved.'}
          </Text>
          <View style={styles.tiles}>
            {tiles.map(c => (
              <View key={c.label} style={styles.tile}>
                <Text style={styles.tileLabel}>{c.label}</Text>
                <Text style={[styles.tileVal, { color: c.color }]}>{c.val}</Text>
                <Text style={styles.tileSub}>{c.sub}</Text>
              </View>
            ))}
          </View>

          <View style={styles.how}>
            <Text style={styles.howTitle}>How it works</Text>
            <Text style={styles.howLine}>{`• You earn ${inr(t.per_booking)} for every booking where the patient paid online and the visit was completed.`}</Text>
            <Text style={styles.howLine}>{`• It is added up and paid by TokenWalla to the UPI below, ${cycle.label.toLowerCase()}. You get a WhatsApp message when it is sent.`}</Text>
            <Text style={styles.howLine}>• It does not count for walk-in or self check-in tokens, Appointment Pass visits, cancellations, no-shows or refunded bookings.</Text>
            <Text style={styles.howLine}>• Nothing is taken from your doctors or the hospital, and the patient pays the same price.</Text>
          </View>

          <Text style={styles.subTitle}>Last 30 days</Text>
          {t.daily.length === 0
            ? <Text style={styles.muted}>No bookings earned in the last 30 days.</Text>
            : t.daily.map(d => (
              <View key={d.date} style={styles.row}>
                <Text style={styles.rowMain}>{day(d.date)}</Text>
                <Text style={styles.rowSub}>{`${d.count} booking${d.count === 1 ? '' : 's'}`}</Text>
                <Text style={styles.rowAmt}>{inr(d.amount)}</Text>
              </View>
            ))}

          <Text style={styles.subTitle}>Payments received</Text>
          {t.payments.length === 0
            ? <Text style={styles.muted}>No payments yet.</Text>
            : t.payments.map(p => (
              <View key={`${p.paid_at}-${p.utr}`} style={styles.row}>
                <Text style={styles.rowMain}>{day(p.paid_at)}</Text>
                <Text style={styles.rowSub}>{`UTR ${p.utr} · ${p.count} booking${p.count === 1 ? '' : 's'}`}</Text>
                <Text style={styles.rowAmt}>{inr(p.amount)}</Text>
              </View>
            ))}
        </>
      )}

      <Text style={styles.subTitle}>Who is paid, and how often</Text>
      <Text style={styles.label}>Staff name</Text>
      <TextInput
        style={styles.input}
        placeholder="Front-desk person"
        placeholderTextColor={Colors.gray400}
        value={payee.name}
        onChangeText={v => setPayee(p => ({ ...p, name: v }))}
      />
      <Text style={styles.label}>Staff UPI ID</Text>
      <TextInput
        style={[styles.input, !!error.upi && styles.inputError]}
        placeholder="name@bank"
        placeholderTextColor={Colors.gray400}
        autoCapitalize="none"
        value={payee.upi}
        onChangeText={v => setPayee(p => ({ ...p, upi: v }))}
      />
      {!!error.upi && <Text style={styles.error}>{error.upi}</Text>}
      <Text style={styles.label}>Staff WhatsApp number</Text>
      <TextInput
        style={[styles.input, !!error.phone && styles.inputError]}
        placeholder="10-digit mobile (optional)"
        placeholderTextColor={Colors.gray400}
        keyboardType="number-pad"
        value={payee.phone}
        onChangeText={v => setPayee(p => ({ ...p, phone: tenDigitMobile(v) }))}
      />
      {!!error.phone && <Text style={styles.error}>{error.phone}</Text>}
      <Text style={styles.hint}>We message this number when the incentive is paid.</Text>

      <Text style={styles.label}>Paid</Text>
      <View style={styles.cycles}>
        {CYCLES.map(c => {
          const on = payee.frequency === c.value;
          return (
            <TouchableOpacity
              key={c.value}
              style={[styles.cycle, on && styles.cycleOn]}
              accessibilityState={{ selected: on }}
              onPress={() => setPayee(p => ({ ...p, frequency: c.value }))}
            >
              <Text style={[styles.cycleText, on && styles.cycleTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!!error.general && <Text style={styles.error}>{error.general}</Text>}
      {saved && <Text style={styles.ok}>Staff incentive details saved.</Text>}
      <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save staff incentive'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 14, marginBottom: 18 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 4 },
  muted: { fontSize: 12.5, color: Colors.gray500, lineHeight: 18, marginBottom: 8 },

  tiles:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tile:      { flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 11 },
  tileLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.gray400, marginBottom: 4 },
  tileVal:   { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  tileSub:   { fontSize: 10.5, color: Colors.gray400 },

  how:      { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 12, marginBottom: 6 },
  howTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.gray700, marginBottom: 4 },
  howLine:  { fontSize: 12, color: Colors.gray700, lineHeight: 17, marginBottom: 3 },

  subTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: Colors.blue600, marginTop: 16, marginBottom: 8 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowMain:  { fontSize: 12.5, fontWeight: '600', color: Colors.gray900, width: 96 },
  rowSub:   { flex: 1, fontSize: 11.5, color: Colors.gray500 },
  rowAmt:   { fontSize: 12.5, fontWeight: '700', color: Colors.gray900 },

  label:      { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, marginTop: 8 },
  input:      { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.gray900 },
  inputError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  error:      { fontSize: 11.5, color: Colors.errorText, marginTop: 5 },
  ok:         { fontSize: 12.5, color: Colors.successText, marginTop: 8 },
  hint:       { fontSize: 11.5, color: Colors.gray500, marginTop: 5 },

  cycles:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cycle:       { borderWidth: 1, borderColor: Colors.blue100, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  cycleOn:     { borderColor: Colors.blue400, backgroundColor: Colors.blue50 },
  cycleText:   { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  cycleTextOn: { color: Colors.blue700, fontWeight: '700' },

  save:     { backgroundColor: Colors.blue600, borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  saveText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  card:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 11, marginBottom: 12 },
  cardText: { fontSize: 12.5, color: Colors.gray700, lineHeight: 18 },
  link:     { color: Colors.blue600, fontWeight: '700' },
});
