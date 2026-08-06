/**
 * app/(hospital)/payments.tsx — Doctor Payments.
 *
 * The app's counterpart to the website's Doctor Payments tab
 * (src/hospital/HPayments.js): what patients paid, what each doctor is owed,
 * and where their money is settled. The website's 9-column table doesn't fit a
 * phone, so each doctor is a card with a 2×3 figure grid and the "Manage" form
 * opens as a full-screen sheet.
 *
 * All figures come from GET /doctors/payment-summary/ — the server does the
 * money math (payments/fees.py); nothing is recomputed here.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API from '../../services/api';
import { computeFeeBreakdown, money } from '../../utils/fees';
import { safeBack } from '../../utils/navigation';
import {
  EMPTY_PAYOUT, PAYMENT_METHODS, payoutFromApi, payoutPayload,
  validatePayout, type PayoutForm,
} from '../../utils/payout';

// ─── Types (mirrors the payment-summary response; every figure is a string) ───

interface DoctorRow {
  id: number | string;
  name: string;
  specialization?: string;
  fee?: number | string;
  collection_mode?: string;
  payout_to_hospital?: boolean;
  has_payout_details?: boolean;
  appointments: number;
  total_collected: string;
  doctor_fees_collected: string;
  offline_doctor_fee: string;
  refunded_to_patient: string;
  service_total: string;
  pending_payout: string;
  paid_amount: string;
  last_payout_date: string | null;
}

interface Totals {
  total_collected?: string;
  doctor_fees_collected?: string;
  service_total?: string;
  pending_payout?: string;
  paid_amount?: string;
}

const inr = (v: number | string | undefined) => `₹${money(v ?? 0)}`;

const fmtDate = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Reads as a SETTING, not as a description of past money — only an explicit
// FULL collects the consultation fee online; blank/unknown is service-fee-only.
const modeLabel = (m?: string) => (m === 'FULL' ? 'Collects online' : 'Collects at clinic');

// Illustrative figures for the explainer — never charged, so the local fee
// mirror is the right source here (there is no doctor to price server-side).
const EXAMPLE = computeFeeBreakdown(500, 'FULL');
const EXAMPLE_SERVICE =
  Number(EXAMPLE.platform_fee) + Number(EXAMPLE.gateway_fee) + Number(EXAMPLE.gst_amount);

const COLLECTION_MODES = [
  {
    value: 'SERVICE_ONLY',
    label: 'Service Fee Only',
    hint: 'Patient pays only the TokenWalla service fee online; the consultation fee is collected at the clinic.',
  },
  {
    value: 'FULL',
    label: 'Doctor Fee + Service Fee',
    hint: 'Patient pays the full amount (consultation + service fee) online.',
  },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HospitalPayments() {
  const router = useRouter();

  const [hospitalId, setHospitalId] = useState<number | string | null>(null);
  const [doctors,    setDoctors]    = useState<DoctorRow[]>([]);
  const [totals,     setTotals]     = useState<Totals>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  // Manage-details sheet
  const [modalDoc,    setModalDoc]    = useState<DoctorRow | null>(null);
  const [mode,        setMode]        = useState<string>('SERVICE_ONLY');
  const [toHospital,  setToHospital]  = useState(false);
  const [form,        setForm]        = useState<PayoutForm>(EMPTY_PAYOUT);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [loadingForm, setLoadingForm] = useState(false);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(hospital)/login'); return; }
      const user = JSON.parse(raw);
      if (user.role !== 'hospital' || !user.hospital) { router.replace('/(hospital)/login'); return; }
      setHospitalId(user.hospital.id);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!hospitalId) return;
    try {
      const { data } = await API.get(`/doctors/payment-summary/?hospital=${hospitalId}`);
      setDoctors(data.doctors || []);
      setTotals(data.totals || {});
    } catch {
      Alert.alert('Error', 'Could not load payments. Pull down to try again.');
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Manage sheet ────────────────────────────────────────────────────────
  const openManage = async (row: DoctorRow) => {
    setModalDoc(row);
    setMode(row.collection_mode === 'FULL' ? 'FULL' : 'SERVICE_ONLY');
    setToHospital(!!row.payout_to_hospital);
    setForm(EMPTY_PAYOUT);
    setErrors({});
    setLoadingForm(true);
    try {
      const { data } = await API.get(`/doctors/${row.id}/payment-details/`);
      // Unset ⇒ service fee only, matching the backend default: we never
      // collect a doctor's fee online until a hospital opts in.
      setMode(data.payment_collection_mode === 'FULL' ? 'FULL' : 'SERVICE_ONLY');
      setToHospital(!!data.payout_to_hospital);
      setForm(payoutFromApi(data));
    } catch {
      setModalDoc(null);
      Alert.alert('Error', 'Could not load payment details.');
    } finally {
      setLoadingForm(false);
    }
  };

  const save = async () => {
    if (!modalDoc) return;
    // A salaried doctor is paid into the hospital's account, so their own
    // payout fields are never read — don't demand them.
    const errs = toHospital ? {} : validatePayout(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await API.put(`/doctors/${modalDoc.id}/payment-details/`, {
        payment_collection_mode: mode,
        payout_to_hospital:      toHospital,
        ...payoutPayload(form),
      });
      setModalDoc(null);
      load();
      Alert.alert('Saved', `Payment details updated for ${modalDoc.name}.`);
    } catch (e: any) {
      const apiErrs = e?.response?.data?.errors;
      if (apiErrs && typeof apiErrs === 'object') {
        const flat: Record<string, string> = {};
        Object.entries(apiErrs).forEach(([k, v]) => { flat[k] = Array.isArray(v) ? String(v[0]) : String(v); });
        setErrors(flat);
      } else {
        Alert.alert('Error', e?.response?.data?.message || 'Could not save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof PayoutForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ── Derived ─────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = q
    ? doctors.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q))
    : doctors;
  const needsSetup = doctors.filter(d => !d.has_payout_details).length;

  // Ownership is the organising idea: the first card is everything patients
  // paid, and it splits into the doctors' share and TokenWalla's.
  const cards = [
    { label: 'Patients Paid',      val: totals.total_collected,       color: Colors.successText, hint: 'Consultation + TokenWalla charges, net of refunds' },
    { label: 'Doctor Fees',        val: totals.doctor_fees_collected, color: Colors.blue600,     hint: "Your doctors' fees, paid to them in full" },
    { label: 'Pending Payout',     val: totals.pending_payout,        color: Colors.warningText, hint: 'Earned on completed visits, not yet transferred' },
    { label: 'Paid Out',           val: totals.paid_amount,           color: Colors.blue400,     hint: 'Already transferred to doctor / hospital accounts' },
    { label: 'TokenWalla Charges', val: totals.service_total,         color: Colors.gray500,     hint: 'Paid by patients. Not deducted from you.' },
  ];

  const previewFee  = Number(modalDoc?.fee ?? 0);
  const preview     = computeFeeBreakdown(previewFee, mode);
  const serviceOnly = mode !== 'FULL';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ══════════════ MANAGE DETAILS SHEET ══════════════ */}
      <Modal visible={!!modalDoc} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => !saving && setModalDoc(null)} style={styles.modalCancel}>
                <Ionicons name="close" size={15} color={Colors.errorText} />
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>Payment Details</Text>
              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.6 }]}
                onPress={save}
                disabled={saving || loadingForm}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>

            {loadingForm ? (
              <ActivityIndicator color={Colors.blue600} style={{ marginTop: 40 }} />
            ) : (
              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalDoctor}>{modalDoc?.name}</Text>
                <Text style={styles.modalSpec}>
                  {modalDoc?.specialization || '—'} · {inr(modalDoc?.fee)} consultation
                </Text>

                {/* ── Collection mode ── */}
                <Text style={styles.formSection}>PAYMENT COLLECTION MODE</Text>
                {COLLECTION_MODES.map(m => {
                  const on = mode === m.value;
                  return (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.optionRow, on && styles.optionRowOn]}
                      onPress={() => setMode(m.value)}
                    >
                      <Ionicons
                        name={on ? 'radio-button-on' : 'radio-button-off'}
                        size={19}
                        color={on ? Colors.blue600 : Colors.gray400}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionLabel, on && { color: Colors.blue700 }]}>{m.label}</Text>
                        <Text style={styles.optionHint}>{m.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* ── Live preview of what the setting does to one visit ── */}
                <View style={styles.preview}>
                  <Text style={styles.previewTitle}>ONE {inr(previewFee)} CONSULTATION</Text>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Patient pays online</Text>
                    <Text style={styles.previewVal}>{inr(preview.final_amount)}</Text>
                  </View>
                  {serviceOnly && (
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Patient pays at your clinic</Text>
                      <Text style={styles.previewVal}>{inr(preview.offline_doctor_fee)}</Text>
                    </View>
                  )}
                  <View style={[styles.previewRow, styles.previewRowGood]}>
                    <Text style={[styles.previewLabel, { color: Colors.successText }]}>Doctor receives</Text>
                    <Text style={[styles.previewVal, { color: Colors.successText }]}>
                      {serviceOnly ? `${inr(preview.offline_doctor_fee)} at clinic` : inr(preview.doctor_fee)}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: Colors.gray400 }]}>TokenWalla service fee + GST</Text>
                    <Text style={[styles.previewVal, { color: Colors.gray400 }]}>
                      {inr(Number(preview.platform_fee) + Number(preview.gateway_fee) + Number(preview.gst_amount))}
                    </Text>
                  </View>
                  <Text style={styles.previewNote}>
                    Nothing is deducted from the doctor or billed to the hospital.
                  </Text>
                </View>

                {/* ── Payout destination ── */}
                <Text style={styles.formSection}>PAYOUT ACCOUNT</Text>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.fieldLabel}>Pay fees to the hospital</Text>
                    <Text style={styles.optionHint}>
                      For salaried doctors — fees settle to the hospital's payout account instead.
                      Earnings are still tracked per doctor.
                    </Text>
                  </View>
                  <Switch
                    value={toHospital}
                    onValueChange={setToHospital}
                    trackColor={{ false: Colors.gray200, true: Colors.blue200 }}
                    thumbColor={toHospital ? Colors.blue600 : Colors.gray400}
                  />
                </View>

                {toHospital ? (
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.blue700} />
                    <Text style={styles.infoText}>
                      Payouts for {modalDoc?.name} go to the hospital's account. Set it under
                      Profile → Payout Account. Payouts are held until that account is filled in.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Payment Method</Text>
                    <View style={styles.methodRow}>
                      {PAYMENT_METHODS.map(m => {
                        const on = form.payment_method === m.value;
                        return (
                          <TouchableOpacity
                            key={m.label}
                            style={[styles.methodChip, on && styles.methodChipOn]}
                            onPress={() => setField('payment_method', m.value)}
                          >
                            <Text style={[styles.methodChipText, on && styles.methodChipTextOn]}>{m.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {form.payment_method === 'UPI' && (
                      <>
                        <Text style={styles.fieldLabel}>UPI ID</Text>
                        <TextInput
                          style={[styles.input, errors.upi_id && styles.inputError]}
                          placeholder="clinic@okhdfc"
                          placeholderTextColor={Colors.gray400}
                          autoCapitalize="none"
                          value={form.upi_id}
                          onChangeText={v => setField('upi_id', v)}
                        />
                        <FieldError msg={errors.upi_id} />
                      </>
                    )}

                    {form.payment_method === 'BANK' && (
                      <>
                        <Text style={styles.fieldLabel}>Account Holder Name</Text>
                        <TextInput
                          style={[styles.input, errors.account_holder_name && styles.inputError]}
                          placeholder="As printed on the passbook"
                          placeholderTextColor={Colors.gray400}
                          value={form.account_holder_name}
                          onChangeText={v => setField('account_holder_name', v)}
                        />
                        <FieldError msg={errors.account_holder_name} />

                        <Text style={styles.fieldLabel}>Bank Name</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. HDFC Bank"
                          placeholderTextColor={Colors.gray400}
                          value={form.bank_name}
                          onChangeText={v => setField('bank_name', v)}
                        />

                        <Text style={styles.fieldLabel}>Account Number</Text>
                        <TextInput
                          style={[styles.input, errors.account_number && styles.inputError]}
                          placeholder="Bank account number"
                          placeholderTextColor={Colors.gray400}
                          keyboardType="number-pad"
                          value={form.account_number}
                          onChangeText={v => setField('account_number', v.replace(/\s/g, ''))}
                        />
                        <FieldError msg={errors.account_number} />

                        <Text style={styles.fieldLabel}>IFSC Code</Text>
                        <TextInput
                          style={[styles.input, errors.ifsc_code && styles.inputError]}
                          placeholder="HDFC0001234"
                          placeholderTextColor={Colors.gray400}
                          autoCapitalize="characters"
                          maxLength={11}
                          value={form.ifsc_code}
                          onChangeText={v => setField('ifsc_code', v.toUpperCase())}
                        />
                        <FieldError msg={errors.ifsc_code} />
                      </>
                    )}
                  </>
                )}

                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, { height: 74, textAlignVertical: 'top' }]}
                  placeholder="e.g. Settle weekly, GST invoice to accounts@…"
                  placeholderTextColor={Colors.gray400}
                  multiline
                  value={form.payout_notes}
                  onChangeText={v => setField('payout_notes', v)}
                />

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ══════════════ HEADER ══════════════ */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack(router, '/(hospital)/dashboard')}>
          <Ionicons name="chevron-back" size={18} color={Colors.blue600} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Doctor Payments</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.blue600} />}
      >
        {/* How the money works — the single most asked question */}
        <View style={styles.explain}>
          <Ionicons name="bulb-outline" size={17} color={Colors.blue700} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.explainStrong}>Your doctors keep 100% of their consultation fee.</Text>
            <Text style={styles.explainText}>
              TokenWalla charges the patient a service fee on top — we never deduct from a
              doctor's fee and never bill the hospital.
            </Text>
            <Text style={styles.explainEg}>
              Example: ₹500 consultation → patient pays {inr(EXAMPLE.final_amount)},
              doctor receives ₹500, TokenWalla keeps {inr(EXAMPLE_SERVICE)}.
            </Text>
          </View>
        </View>

        {/* Summary cards */}
        <View style={styles.cardsGrid}>
          {cards.map(c => (
            <View key={c.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{c.label}</Text>
              <Text style={[styles.statVal, { color: c.color }]}>{inr(c.val)}</Text>
              <Text style={styles.statHint}>{c.hint}</Text>
            </View>
          ))}
        </View>

        {/* Search + count */}
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>
            {doctors.length} doctor{doctors.length === 1 ? '' : 's'}
          </Text>
          {needsSetup > 0 && (
            <Text style={styles.needsSetup}>
              {needsSetup} need{needsSetup === 1 ? 's' : ''} a payout account
            </Text>
          )}
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search doctor or specialization"
            placeholderTextColor={Colors.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={17} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        </View>

        {/* Doctor rows */}
        {loading ? (
          <ActivityIndicator color={Colors.blue600} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="medkit-outline" size={38} color={Colors.blue200} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>
              {doctors.length === 0 ? 'No doctors yet' : 'No doctors match your search'}
            </Text>
            {doctors.length === 0 && (
              <Text style={styles.emptySub}>Add a doctor and their payout details will appear here.</Text>
            )}
          </View>
        ) : (
          filtered.map(d => (
            <View key={String(d.id)} style={styles.docCard}>
              <Text style={styles.docName}>{d.name}</Text>
              <Text style={styles.docSpec}>
                {d.specialization || '—'} · {inr(d.fee)} consultation · {d.appointments} visit{d.appointments === 1 ? '' : 's'}
              </Text>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, d.collection_mode === 'FULL' ? styles.badgeBlue : styles.badgeAmber]}>
                  <Text style={[styles.badgeText, { color: d.collection_mode === 'FULL' ? Colors.blue700 : Colors.warningText }]}>
                    {modeLabel(d.collection_mode)}
                  </Text>
                </View>
                {d.has_payout_details ? (
                  <View style={[styles.badge, styles.badgeSlate]}>
                    <Text style={[styles.badgeText, { color: Colors.gray700 }]}>
                      {d.payout_to_hospital ? '→ Hospital a/c' : "→ Doctor's a/c"}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.badge, styles.badgeRed]}>
                    <Text style={[styles.badgeText, { color: Colors.errorText }]}>No payout account</Text>
                  </View>
                )}
              </View>

              <View style={styles.figGrid}>
                {[
                  { label: 'Patients paid', val: inr(d.total_collected),       strong: true },
                  { label: 'Doctor fees',   val: inr(d.doctor_fees_collected)               },
                  { label: 'TokenWalla',    val: inr(d.service_total),         muted: true  },
                  { label: 'Pending',       val: inr(d.pending_payout),        warn: Number(d.pending_payout) > 0 },
                  { label: 'Paid out',      val: inr(d.paid_amount)                         },
                  { label: 'Last payout',   val: fmtDate(d.last_payout_date),  small: true  },
                ].map(f => (
                  <View key={f.label} style={styles.fig}>
                    <Text style={styles.figLabel}>{f.label}</Text>
                    <Text style={[
                      styles.figVal,
                      f.strong && { color: Colors.successText },
                      f.muted  && { color: Colors.gray400 },
                      f.warn   && { color: Colors.warningText },
                      f.small  && { fontSize: 12, fontWeight: '600' },
                    ]}>
                      {f.val}
                    </Text>
                  </View>
                ))}
              </View>

              {Number(d.offline_doctor_fee) > 0 && (
                <Text style={styles.footNote}>{inr(d.offline_doctor_fee)} collected at the clinic</Text>
              )}
              {Number(d.refunded_to_patient) > 0 && (
                <Text style={[styles.footNote, { color: Colors.errorText }]}>
                  −{inr(d.refunded_to_patient)} refunded to patients on cancellation
                </Text>
              )}

              <TouchableOpacity style={styles.manageBtn} onPress={() => openManage(d)}>
                <Ionicons name="settings-outline" size={15} color={Colors.white} />
                <Text style={styles.manageBtnText}>Manage</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <Text style={styles.fieldError}>{msg}</Text> : null;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn:     { width: 90, flexDirection: 'row', alignItems: 'center', gap: 3 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.blue600 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  explain:       { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 14, marginBottom: 16 },
  explainStrong: { fontSize: 13, fontWeight: '800', color: Colors.blue900, marginBottom: 2 },
  explainText:   { fontSize: 12.5, color: Colors.blue700, lineHeight: 18 },
  explainEg:     { fontSize: 11.5, color: Colors.gray500, lineHeight: 17, marginTop: 5 },

  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statCard:  { flexGrow: 1, flexBasis: '46%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 13 },
  statLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.gray400, marginBottom: 5 },
  statVal:   { fontSize: 20, fontWeight: '800', marginBottom: 3 },
  statHint:  { fontSize: 10.5, color: Colors.gray400, lineHeight: 14 },

  listHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  listTitle:  { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  needsSetup: { fontSize: 12, fontWeight: '700', color: Colors.warningText },

  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900, padding: 0 },

  empty:      { alignItems: 'center', paddingVertical: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray700 },
  emptySub:   { fontSize: 13, color: Colors.gray400, marginTop: 5, textAlign: 'center' },

  docCard:  { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 14, marginBottom: 12 },
  docName:  { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  docSpec:  { fontSize: 12, color: Colors.gray500, marginTop: 2 },

  badgeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  badge:      { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText:  { fontSize: 10.5, fontWeight: '700' },
  badgeBlue:  { backgroundColor: Colors.blue50 },
  badgeAmber: { backgroundColor: Colors.warningBg },
  badgeSlate: { backgroundColor: Colors.gray100 },
  badgeRed:   { backgroundColor: Colors.errorBg },

  figGrid:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: 10 },
  fig:      { width: '33.33%', paddingVertical: 5, paddingRight: 6 },
  figLabel: { fontSize: 10.5, color: Colors.gray400, marginBottom: 2 },
  figVal:   { fontSize: 13.5, fontWeight: '700', color: Colors.gray900 },

  footNote: { fontSize: 11.5, color: Colors.gray500, marginTop: 8 },

  manageBtn:     { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.blue600, borderRadius: 11, paddingVertical: 11, marginTop: 12 },
  manageBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // ── Manage sheet ──
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100 },
  modalCancel:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  modalCancelText: { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  modalTitle:      { fontSize: 15, fontWeight: '800', color: Colors.gray900, flexShrink: 1 },
  modalSave:       { backgroundColor: Colors.blue600, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, minWidth: 68, alignItems: 'center' },
  modalSaveText:   { color: Colors.white, fontWeight: '700', fontSize: 13 },
  modalBody:       { padding: 16 },
  modalDoctor:     { fontSize: 17, fontWeight: '800', color: Colors.gray900 },
  modalSpec:       { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },

  formSection: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: Colors.blue600, marginTop: 22, marginBottom: 10 },

  optionRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 12, marginBottom: 8 },
  optionRowOn: { borderColor: Colors.blue400, backgroundColor: Colors.blue50 },
  optionLabel: { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  optionHint:  { fontSize: 11.5, color: Colors.gray500, lineHeight: 16.5, marginTop: 2 },

  preview:       { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 13, marginTop: 6 },
  previewTitle:  { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, color: Colors.gray400, marginBottom: 7 },
  previewRow:    { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  previewRowGood:{ borderTopWidth: 1, borderTopColor: Colors.gray200, marginTop: 5, paddingTop: 7 },
  previewLabel:  { fontSize: 12.5, color: Colors.gray700, flexShrink: 1 },
  previewVal:    { fontSize: 12.5, fontWeight: '700', color: Colors.gray900 },
  previewNote:   { fontSize: 11, color: Colors.gray400, marginTop: 7, lineHeight: 15 },

  switchRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 12, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7, marginTop: 4 },
  input:      { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900 },
  inputError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  fieldError: { fontSize: 11.5, color: Colors.errorText, marginTop: 5 },

  infoBox:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 12 },
  infoText: { flex: 1, fontSize: 12, color: Colors.blue700, lineHeight: 17 },

  methodRow:         { flexDirection: 'row', gap: 8, marginBottom: 4 },
  methodChip:        { borderWidth: 1, borderColor: Colors.blue100, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  methodChipOn:      { borderColor: Colors.blue400, backgroundColor: Colors.blue50 },
  methodChipText:    { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  methodChipTextOn:  { color: Colors.blue700, fontWeight: '700' },
});
