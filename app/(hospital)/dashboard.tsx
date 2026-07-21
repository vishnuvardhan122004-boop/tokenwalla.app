/**
 * HospitalDashboard.tsx  — React Native / Expo (TypeScript)
 *
 * Fixes applied:
 *  ✅ Explicit TypeScript interfaces for Doctor, Patient, Queue, Hospital
 *  ✅ useState typed correctly — no more `never[]` errors
 *  ✅ ImageFile interface for typed image state (fixes SetStateAction<null> errors)
 *  ✅ All function parameters explicitly typed
 *  ✅ hospital null-checks with optional chaining
 *  ✅ expo-image-picker properly imported and typed
 *
 * Install dependencies first:
 *   npx expo install expo-image-picker expo-media-library
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import NotificationBell from '../../components/NotificationBell';
import API, { logoutUser } from '../../services/api';
import { notifyHospitalNewBooking, registerPushToken } from '../../services/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hospital {
  id: number | string;
  name: string;
  city?: string;
}

interface Doctor {
  id: number | string;
  name: string;
  specialization: string;
  mobile: string;
  experience: number | string;
  fee: number | string;
  max_per_slot: number | string;
  available: boolean;
  slots: string[];
  days?: string[];
  image?: string;
  hospital_image?: string;
}

interface Patient {
  id: number | string;
  user_name?: string;
  user_mobile?: string;
  doctor_name?: string;
  slot?: string;
  token?: string | number;
  date?: string; // "YYYY-MM-DD" from the backend BookingSerializer
}

interface QueueState {
  waiting: Patient[];
  onHold: Patient[];
  inProgress: Patient[];
  completed: Patient[];
}

interface FormState {
  name: string;
  specialization: string;
  mobile: string;
  experience: string;
  fee: string;
  max_per_slot: string;
  available: boolean;
  slots: string[];
  days: string[];
}

interface ImageFile {
  uri: string;
  name: string;
  type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SLOTS: string[] = [
  "12:00 AM","12:30 AM","01:00 AM","01:30 AM","02:00 AM","02:30 AM",
  "03:00 AM","03:30 AM","04:00 AM","04:30 AM","05:00 AM","05:30 AM",
  "06:00 AM","06:30 AM","07:00 AM","07:30 AM","08:00 AM","08:30 AM",
  "09:00 AM","09:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","01:00 PM","01:30 PM","02:00 PM","02:30 PM",
  "03:00 PM","03:30 PM","04:00 PM","04:30 PM","05:00 PM","05:30 PM",
  "06:00 PM","06:30 PM","07:00 PM","07:30 PM","08:00 PM","08:30 PM",
  "09:00 PM","09:30 PM","10:00 PM","10:30 PM","11:00 PM","11:30 PM",
];

const SLOT_SECTIONS = [
  { label: "🌙 Late Night / Early Morning", slots: DEFAULT_SLOTS.slice(0, 12) },
  { label: "🌅 Morning",                    slots: DEFAULT_SLOTS.slice(12, 24) },
  { label: "☀️ Afternoon",                  slots: DEFAULT_SLOTS.slice(24, 32) },
  { label: "🌆 Evening",                    slots: DEFAULT_SLOTS.slice(32, 40) },
  { label: "🌙 Night",                      slots: DEFAULT_SLOTS.slice(40, 48) },
];

// Days of the week the doctor is available on (separate from time slots).
const DAYS_OF_WEEK: { key: string; label: string }[] = [
  { key: 'Mon', label: 'Monday'    },
  { key: 'Tue', label: 'Tuesday'   },
  { key: 'Wed', label: 'Wednesday' },
  { key: 'Thu', label: 'Thursday'  },
  { key: 'Fri', label: 'Friday'    },
  { key: 'Sat', label: 'Saturday'  },
  { key: 'Sun', label: 'Sunday'    },
];

const EMPTY_FORM: FormState = {
  name:           '',
  specialization: '',
  mobile:         '',
  experience:     '',
  fee:            '',
  max_per_slot:   '10',
  available:      true,
  slots:          [],
  days:           [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidImage(url: string | undefined): boolean {
  return !!url && !url.includes('placehold') && url.startsWith('http');
}

async function requestMediaPermission(): Promise<boolean> {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow photo library access in Settings to upload images.',
      );
      return false;
    }
  }
  return true;
}

async function pickImage(type: 'doctor' | 'hospital'): Promise<ImageFile | null> {
  const allowed = await requestMediaPermission();
  if (!allowed) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: type === 'hospital' ? [16, 9] : [1, 1],
    quality: 0.8,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  const fileName = asset.uri.split('/').pop() ?? 'image.jpg';
  const match    = /\.(\w+)$/.exec(fileName);
  const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

  return { uri: asset.uri, name: fileName, type: mimeType };
}

/**
 * Turn an axios / network error into a message a human can act on.
 *
 * The backend (DRF) reports validation failures in several shapes:
 *   • { message: "..." } / { detail: "..." } / { error: "..." }
 *   • field errors at the ROOT of response.data, e.g. { mobile: ["already exists"] }
 *   • a plain string body
 * The old code only checked `.message` and `.errors`, then fell back to
 * `JSON.stringify(... || {})` — which is the truthy string "{}", so staff saw a
 * literal "{}" and the real reason was lost. This never returns "{}".
 */
function extractApiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: unknown }; message?: string };
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) return data.trim();

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error'] as const) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    // DRF field errors: { field: ["msg", ...] | "msg" }
    const parts: string[] = [];
    for (const [field, val] of Object.entries(obj)) {
      const text = Array.isArray(val)
        ? val.filter(Boolean).join(' ')
        : typeof val === 'string' ? val : '';
      if (text.trim()) {
        parts.push(field === 'non_field_errors' ? text.trim() : `${field}: ${text.trim()}`);
      }
    }
    if (parts.length) return parts.join('\n');
  }

  // No response body → network/transport failure.
  if (err?.message === 'Network Error') {
    return 'No internet connection. Please check your network and try again.';
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();

  return fallback;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function HospitalDashboard() {
  const router = useRouter();

  const [hospital,   setHospital]   = useState<Hospital | null>(null);
  const [activeTab,  setActiveTab]  = useState<'queue' | 'doctors'>('queue');
  // Which day's bookings the queue shows. The queue endpoint returns bookings
  // from ALL dates mixed together, so staff need to split them by day.
  const [dayFilter,  setDayFilter]  = useState<'today' | 'tomorrow' | 'all'>('today');
  const [queue,      setQueue]      = useState<QueueState>({ waiting: [], onHold: [], inProgress: [], completed: [] });
  const [doctors,    setDoctors]    = useState<Doctor[]>([]);
  const [loading,    setLoading]    = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [showModal,  setShowModal]  = useState<boolean>(false);
  const [editDoc,    setEditDoc]    = useState<Doctor | null>(null);
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [saving,     setSaving]     = useState<boolean>(false);
  const [toggling,   setToggling]   = useState<number | string | null>(null);

  const [doctorImageFile,      setDoctorImageFile]      = useState<ImageFile | null>(null);
  const [doctorImagePreview,   setDoctorImagePreview]   = useState<string | null>(null);
  const [hospitalImageFile,    setHospitalImageFile]    = useState<ImageFile | null>(null);
  const [hospitalImagePreview, setHospitalImagePreview] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(hospital)/login'); return; }
      const user = JSON.parse(raw);
      if (user.role !== 'hospital' || !user.hospital) {
        router.replace('/(hospital)/login');
        return;
      }
      setHospital(user.hospital);
      // Register this device so the hospital gets new-booking pushes in the background.
      registerPushToken('hospital');
    })();
  }, []);

  // Tracks booking ids already seen so we only notify on genuinely new bookings.
  // null until the first successful load (so we don't alert for the initial batch).
  const knownIdsRef = useRef<Set<string> | null>(null);

  // ── Load Queue ────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    if (!hospital) return;
    try {
      const { data } = await API.get(`/bookings/queue/${hospital.id}/`);
      const waiting    = Array.isArray(data.waiting)    ? data.waiting    : [];
      const onHold     = Array.isArray(data.onHold)     ? data.onHold     : [];
      const inProgress = Array.isArray(data.inProgress) ? data.inProgress : [];
      const completed  = Array.isArray(data.completed)  ? data.completed  : [];
      setQueue({ waiting, onHold, inProgress, completed });

      // ── Notify hospital of newly-booked (waiting) patients ──
      const allIds = [...waiting, ...inProgress, ...completed].map((p: Patient) => String(p.id));
      if (knownIdsRef.current === null) {
        // First load — seed the baseline, don't notify.
        knownIdsRef.current = new Set(allIds);
      } else {
        const known = knownIdsRef.current;
        for (const p of waiting as Patient[]) {
          if (!known.has(String(p.id))) {
            notifyHospitalNewBooking({
              patientName: p.user_name,
              doctorName:  p.doctor_name,
              slot:        p.slot,
              token:       p.token != null ? String(p.token) : undefined,
            });
          }
        }
        knownIdsRef.current = new Set(allIds);
      }
    } catch {}
  }, [hospital]);

  // ── Load Doctors ──────────────────────────────────────────────────────────
  const loadDoctors = useCallback(async () => {
    if (!hospital) return;
    try {
      const { data } = await API.get(`/doctors/?hospital=${hospital.id}`);
      const list: Doctor[] = Array.isArray(data) ? data : (data.results || []);
      setDoctors(list);
    } catch {}
    finally { setLoading(false); }
  }, [hospital]);

  useEffect(() => {
    if (!hospital) return;
    loadQueue();
    loadDoctors();
    const interval = setInterval(loadQueue, 10000);
    return () => clearInterval(interval);
  }, [hospital, loadQueue, loadDoctors]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadQueue(), loadDoctors()]);
    setRefreshing(false);
  };

  // ── Queue Actions ─────────────────────────────────────────────────────────
  const callNext = async (id: number | string) => {
    try { await API.patch(`/bookings/call/${id}/`); loadQueue(); }
    catch { Alert.alert('Error', 'Failed to call patient'); }
  };

  const complete = async (id: number | string) => {
    try { await API.patch(`/bookings/complete/${id}/`); loadQueue(); }
    catch { Alert.alert('Error', 'Failed to mark complete'); }
  };

  // Skip a patient who isn't ready without cancelling them. The same endpoint
  // toggles: waiting → held (hold), held → waiting (resume).
  const toggleHold = async (id: number | string) => {
    try { await API.patch(`/bookings/hold/${id}/`); loadQueue(); }
    catch { Alert.alert('Error', 'Failed to update hold status'); }
  };

  // Long-press action: patient never turned up. Confirmed because it drops
  // them from the queue and can't be undone from here.
  const noShow = (id: number | string, name: string) => {
    Alert.alert(
      'Mark as no-show?',
      `${name} will be removed from today's queue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'No-show',
          style: 'destructive',
          onPress: async () => {
            try { await API.patch(`/bookings/no-show/${id}/`); loadQueue(); }
            catch { Alert.alert('Error', 'Failed to mark no-show'); }
          },
        },
      ],
    );
  };

  // ── Toggle Availability ───────────────────────────────────────────────────
  const toggleAvail = async (doc: Doctor) => {
    const newVal = !doc.available;
    setToggling(doc.id);
    setDoctors(prev => prev.map(d => d.id === doc.id ? { ...d, available: newVal } : d));
    try {
      await API.patch(
        `/doctors/${doc.id}/`,
        { available: newVal },
        { headers: { 'Content-Type': 'application/json' } },
      );
    } catch {
      setDoctors(prev => prev.map(d => d.id === doc.id ? { ...d, available: !newVal } : d));
      Alert.alert('Error', 'Failed to update availability');
    }
    setToggling(null);
  };

  // ── Delete Doctor ─────────────────────────────────────────────────────────
  const deleteDoctor = (doc: Doctor) => {
    Alert.alert(
      'Delete Doctor',
      `Are you sure you want to delete Dr. ${doc.name}?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await API.delete(`/doctors/${doc.id}/`);
              loadDoctors();
            } catch {
              Alert.alert('Error', 'Failed to delete. The doctor may have active bookings.');
            }
          },
        },
      ],
    );
  };

  // ── Modal: open for Add ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditDoc(null);
    setForm(EMPTY_FORM);
    setDoctorImageFile(null);
    setDoctorImagePreview(null);
    setHospitalImageFile(null);
    setHospitalImagePreview(null);
    setShowModal(true);
  };

  // ── Modal: open for Edit ──────────────────────────────────────────────────
  const openEdit = (doc: Doctor) => {
    setEditDoc(doc);
    setForm({
      name:           doc.name            || '',
      specialization: doc.specialization  || '',
      mobile:         doc.mobile          || '',
      experience:     String(doc.experience   || ''),
      fee:            String(doc.fee          || ''),
      max_per_slot:   String(doc.max_per_slot || 10),
      available:      doc.available       ?? true,
      slots:          doc.slots           || [],
      days:           doc.days            || [],
    });
    setDoctorImageFile(null);
    setDoctorImagePreview(isValidImage(doc.image) ? doc.image! : null);
    setHospitalImageFile(null);
    setHospitalImagePreview(isValidImage(doc.hospital_image) ? doc.hospital_image! : null);
    setShowModal(true);
  };

  // ── Image pickers ─────────────────────────────────────────────────────────
  const handlePickDoctorImage = async () => {
    const file = await pickImage('doctor');
    if (!file) return;
    setDoctorImageFile(file);
    setDoctorImagePreview(file.uri);
  };

  const handlePickHospitalImage = async () => {
    const file = await pickImage('hospital');
    if (!file) return;
    setHospitalImageFile(file);
    setHospitalImagePreview(file.uri);
  };

  // ── Slot toggle ───────────────────────────────────────────────────────────
  const toggleSlot = (slot: string) => {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.includes(slot)
        ? prev.slots.filter((s: string) => s !== slot)
        : [...prev.slots, slot],
    }));
  };

  // ── Day toggle ────────────────────────────────────────────────────────────
  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d: string) => d !== day)
        : [...prev.days, day],
    }));
  };

  // ── Submit doctor form ────────────────────────────────────────────────────
  const submitForm = async () => {
    if (!form.name.trim())           { Alert.alert('Validation', 'Doctor name is required');       return; }
    if (!form.specialization.trim()) { Alert.alert('Validation', 'Specialization is required');    return; }
    if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      Alert.alert('Validation', 'Enter a valid 10-digit Indian mobile number');
      return;
    }
    if (form.days.length === 0)  { Alert.alert('Validation', 'Select at least one available day'); return; }
    if (form.slots.length === 0) { Alert.alert('Validation', 'Select at least one time slot'); return; }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('name',           form.name.trim());
      payload.append('specialization', form.specialization.trim());
      payload.append('mobile',         form.mobile.trim());
      payload.append('experience',     form.experience   || '0');
      payload.append('fee',            form.fee          || '0');
      payload.append('max_per_slot',   form.max_per_slot || '10');
      payload.append('available',      String(form.available));
      payload.append('slots',          JSON.stringify(form.slots));
      payload.append('days',           JSON.stringify(form.days));

      if (!editDoc && hospital) {
        payload.append('hospital', String(hospital.id));
        payload.append('city',     hospital.city || '');
      }

      if (doctorImageFile) {
        payload.append('image', doctorImageFile as unknown as Blob);
      }
      if (hospitalImageFile) {
        payload.append('hospital_image', hospitalImageFile as unknown as Blob);
      }

      if (editDoc) {
        await API.patch(`/doctors/${editDoc.id}/`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        Alert.alert('✅ Updated', `Dr. ${form.name} updated successfully!`);
      } else {
        await API.post('/doctors/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        Alert.alert('✅ Added', `Dr. ${form.name} added successfully!`);
      }

      setShowModal(false);
      loadDoctors();
    } catch (e: unknown) {
      Alert.alert('Error', extractApiError(e, 'Failed to save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Day filtering (Today / Tomorrow / All) ─────────────────────────────────
  // Local calendar dates as "YYYY-MM-DD" to match the backend's date strings.
  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayYMD    = toYMD(new Date());
  const tomorrowYMD = toYMD(new Date(Date.now() + 86400000));

  // Friendly label for a booking's date, shown on each patient card.
  const dayLabelFor = (date?: string): string => {
    if (!date) return 'No date';
    if (date === todayYMD)    return 'Today';
    if (date === tomorrowYMD) return 'Tomorrow';
    return date;
  };

  const matchesDay = (p: Patient): boolean => {
    if (dayFilter === 'all') return true;
    return (p.date || '') === (dayFilter === 'today' ? todayYMD : tomorrowYMD);
  };

  const fWaiting    = queue.waiting.filter(matchesDay);
  const fOnHold     = queue.onHold.filter(matchesDay);
  const fInProgress = queue.inProgress.filter(matchesDay);
  const fCompleted  = queue.completed.filter(matchesDay);
  const filteredTotal = fWaiting.length + fOnHold.length + fInProgress.length + fCompleted.length;

  // Counts per day for the filter pills, so staff see at a glance where the
  // patients are without switching tabs.
  const countForDay = (day: 'today' | 'tomorrow' | 'all'): number => {
    const all = [...queue.waiting, ...queue.onHold, ...queue.inProgress, ...queue.completed];
    if (day === 'all') return all.length;
    const target = day === 'today' ? todayYMD : tomorrowYMD;
    return all.filter(p => (p.date || '') === target).length;
  };

  // Tapping a token opens a quick detail popup — handy for reading the token
  // aloud or confirming the patient at the counter.
  const showTokenDetail = (p: Patient) => {
    Alert.alert(
      `Token ${p.token ?? '—'}`,
      [
        `Patient: ${p.user_name || 'Patient'}`,
        p.user_mobile ? `Mobile: ${p.user_mobile}` : null,
        p.doctor_name ? `Doctor: ${p.doctor_name}` : null,
        p.slot ? `Slot: ${p.slot}` : null,
        `Day: ${dayLabelFor(p.date)}`,
      ].filter(Boolean).join('\n'),
      [{ text: 'Close' }],
    );
  };

  if (!hospital) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.blue600} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ══════════════════════════════════════════════════════════════════════
          DOCTOR FORM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>✕ Cancel</Text>
              </TouchableOpacity>

              <Text style={styles.modalTitle} numberOfLines={1}>
                {editDoc ? `Edit Dr. ${editDoc.name}` : '➕ Add New Doctor'}
              </Text>

              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.6 }]}
                onPress={submitForm}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.modalSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── IMAGES SECTION ─────────────────────────────────────── */}
              <Text style={styles.formSection}>IMAGES</Text>

              {/* Doctor profile image */}
              <Text style={styles.fieldLabel}>👤 Doctor Profile Photo</Text>
              <View style={styles.imageRow}>
                {doctorImagePreview ? (
                  <Image source={{ uri: doctorImagePreview }} style={styles.doctorImgPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.doctorImgPlaceholder}>
                    <Text style={{ fontSize: 30 }}>🩺</Text>
                  </View>
                )}

                <View style={styles.imagePickerCol}>
                  <TouchableOpacity style={styles.pickImageBtn} onPress={handlePickDoctorImage}>
                    <Text style={styles.pickImageBtnText}>
                      {doctorImagePreview ? '🔄 Change Photo' : '📷 Choose Photo'}
                    </Text>
                  </TouchableOpacity>

                  {doctorImagePreview && (
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => { setDoctorImageFile(null); setDoctorImagePreview(null); }}
                    >
                      <Text style={styles.removeImageBtnText}>✕ Remove</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.imageHint}>Max 5 MB · JPG, PNG, WebP</Text>
                  <Text style={styles.imageHint}>Square crop recommended</Text>
                </View>
              </View>

              {/* Hospital banner image */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>🏥 Hospital Banner Photo</Text>

              {hospitalImagePreview ? (
                <View style={styles.hospitalBannerPreviewWrap}>
                  <Image source={{ uri: hospitalImagePreview }} style={styles.hospitalBannerPreview} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.bannerRemoveBtn}
                    onPress={() => { setHospitalImageFile(null); setHospitalImagePreview(null); }}
                  >
                    <Text style={styles.bannerRemoveBtnText}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.hospitalBannerPlaceholder}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>🏥</Text>
                  <Text style={styles.imageHint}>No banner selected</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.pickImageBtn, { marginTop: 8 }]} onPress={handlePickHospitalImage}>
                <Text style={styles.pickImageBtnText}>
                  {hospitalImagePreview ? '🔄 Change Banner' : '📷 Choose Banner'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.imageHint, { marginTop: 4 }]}>16:9 landscape · Max 5 MB</Text>

              {/* ── BASIC INFO ─────────────────────────────────────────── */}
              <Text style={styles.formSection}>BASIC INFORMATION</Text>

              <Text style={styles.fieldLabel}>Doctor Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Ravi Kumar"
                placeholderTextColor={Colors.gray400}
                value={form.name}
                onChangeText={(v: string) => setForm(p => ({ ...p, name: v }))}
              />

              <Text style={styles.fieldLabel}>Specialization *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Cardiologist"
                placeholderTextColor={Colors.gray400}
                value={form.specialization}
                onChangeText={(v: string) => setForm(p => ({ ...p, specialization: v }))}
              />

              <Text style={styles.fieldLabel}>Mobile Number *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="10-digit mobile"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                maxLength={10}
                value={form.mobile}
                onChangeText={(v: string) => setForm(p => ({ ...p, mobile: v.replace(/\D/, '') }))}
              />

              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Experience (years)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 5"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    value={form.experience}
                    onChangeText={(v: string) => setForm(p => ({ ...p, experience: v }))}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.fieldLabel}>Fee (₹)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 300"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    value={form.fee}
                    onChangeText={(v: string) => setForm(p => ({ ...p, fee: v }))}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Max Patients Per Slot</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 10"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                value={form.max_per_slot}
                onChangeText={(v: string) => setForm(p => ({ ...p, max_per_slot: v }))}
              />

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.fieldLabel}>Availability</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray400 }}>
                    {form.available ? '✅ Doctor is available' : '❌ Doctor is unavailable'}
                  </Text>
                </View>
                <Switch
                  value={form.available}
                  onValueChange={(v: boolean) => setForm(p => ({ ...p, available: v }))}
                  trackColor={{ false: Colors.gray200, true: Colors.blue200 }}
                  thumbColor={form.available ? Colors.blue600 : Colors.gray400}
                />
              </View>

              {/* ── AVAILABLE DAYS ────────────────────────────────────── */}
              <Text style={styles.formSection}>
                AVAILABLE DAYS  ({form.days.length} of {DAYS_OF_WEEK.length} selected)
              </Text>

              <View style={styles.slotActions}>
                <TouchableOpacity
                  style={styles.slotActionBtn}
                  onPress={() => setForm(p => ({ ...p, days: DAYS_OF_WEEK.map(d => d.key) }))}
                >
                  <Text style={styles.slotActionText}>✅ Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotActionBtn, { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg }]}
                  onPress={() => setForm(p => ({ ...p, days: [] }))}
                >
                  <Text style={[styles.slotActionText, { color: Colors.errorText }]}>🗑 Clear All</Text>
                </TouchableOpacity>
              </View>

              {form.days.length === 0 && (
                <View style={styles.slotWarning}>
                  <Text style={{ fontSize: 13, color: Colors.errorText }}>
                    ⚠️ Please select at least one day
                  </Text>
                </View>
              )}

              <View style={styles.slotGrid}>
                {DAYS_OF_WEEK.map(({ key, label }) => {
                  const selected = form.days.includes(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.dayChip, selected && styles.slotChipActive]}
                      onPress={() => toggleDay(key)}
                    >
                      <Text style={[styles.slotChipText, selected && styles.slotChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── SLOTS ─────────────────────────────────────────────── */}
              <Text style={styles.formSection}>
                TIME SLOTS  ({form.slots.length} of {DEFAULT_SLOTS.length} selected)
              </Text>

              <View style={styles.slotActions}>
                <TouchableOpacity
                  style={styles.slotActionBtn}
                  onPress={() => setForm(p => ({ ...p, slots: [...DEFAULT_SLOTS] }))}
                >
                  <Text style={styles.slotActionText}>✅ Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotActionBtn, { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg }]}
                  onPress={() => setForm(p => ({ ...p, slots: [] }))}
                >
                  <Text style={[styles.slotActionText, { color: Colors.errorText }]}>🗑 Clear All</Text>
                </TouchableOpacity>
              </View>

              {form.slots.length === 0 && (
                <View style={styles.slotWarning}>
                  <Text style={{ fontSize: 13, color: Colors.errorText }}>
                    ⚠️ Please select at least one slot
                  </Text>
                </View>
              )}

              {SLOT_SECTIONS.map(section => (
                <View key={section.label} style={{ marginBottom: 14 }}>
                  <Text style={styles.slotSectionLabel}>{section.label}</Text>
                  <View style={styles.slotGrid}>
                    {section.slots.map((slot: string) => {
                      const selected = form.slots.includes(slot);
                      return (
                        <TouchableOpacity
                          key={slot}
                          style={[styles.slotChip, selected && styles.slotChipActive]}
                          onPress={() => toggleSlot(slot)}
                        >
                          <Text style={[styles.slotChipText, selected && styles.slotChipTextActive]}>
                            {slot}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={{ height: 50 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.navbar}>
        <View style={styles.navLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(patient)/home')}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.navTitle} numberOfLines={1}>🏥 {hospital.name}</Text>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live · Auto-refreshes every 10s</Text>
            </View>
          </View>
        </View>
        <View style={styles.navRight}>
          <NotificationBell
            audience="hospital"
            onPress={() => router.push('/(patient)/notifications?audience=hospital')}
          />
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/(hospital)/profile')}>
            <Text style={styles.profileBtnText}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => {
              Alert.alert('Logout', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: () => {
                  logoutUser().catch(() => {
                    Alert.alert('Error', 'Logout failed. Please try again.');
                  });
                }, },
              ]);
            }}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN SCROLL VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.blue600} />
        }
      >
        {/* ── STATS ── */}
        <View style={styles.statsGrid}>
          {[
            { label: `${dayFilter === 'all' ? 'All' : dayFilter === 'today' ? 'Today' : 'Tomorrow'} Total`, val: filteredTotal,     color: Colors.blue600    },
            { label: 'Waiting',      val: fWaiting.length,    color: Colors.warningText },
            { label: 'In Progress',  val: fInProgress.length, color: Colors.blue400    },
            { label: 'Completed',    val: fCompleted.length,  color: Colors.successText },
          ].map(({ label, val, color }) => (
            <View key={label} style={styles.statCard}>
              <Text style={[styles.statNum, { color }]}>{val}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── TABS ── */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'queue' && styles.tabActive]}
            onPress={() => setActiveTab('queue')}
          >
            <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>
              🏥 Queue ({fWaiting.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'doctors' && styles.tabActive]}
            onPress={() => setActiveTab('doctors')}
          >
            <Text style={[styles.tabText, activeTab === 'doctors' && styles.tabTextActive]}>
              👨‍⚕️ Doctors ({doctors.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => router.push('/(hospital)/scanner')}
          >
            <Text style={styles.tabText}>📷 Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            QUEUE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <View style={{ padding: 16 }}>

            {/* ── DAY FILTER: Today / Tomorrow / All ── */}
            <View style={styles.dayFilterRow}>
              {([
                { key: 'today',    label: 'Today',    emoji: '📅', active: styles.dayPillTodayActive    },
                { key: 'tomorrow', label: 'Tomorrow', emoji: '⏭️', active: styles.dayPillTomorrowActive },
                { key: 'all',      label: 'All',      emoji: '🗓️', active: styles.dayPillAllActive      },
              ] as const).map(({ key, label, emoji, active }) => {
                const isActive = dayFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.dayPill, isActive && active]}
                    onPress={() => setDayFilter(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Show ${label} queue, ${countForDay(key)} patients`}
                  >
                    <Text style={[styles.dayPillText, isActive && styles.dayPillTextActive]}>
                      {emoji} {label}
                    </Text>
                    <Text style={[styles.dayPillCount, isActive && styles.dayPillTextActive]}>
                      {countForDay(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.queueSection}>⏳ Waiting ({fWaiting.length})</Text>
            {fWaiting.length === 0
              ? <Text style={styles.emptyMsg}>No patients waiting</Text>
              : fWaiting.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.warningText }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{p.user_name || 'Patient'}</Text>
                    <Text style={styles.patientMeta}>📱 {p.user_mobile || 'N/A'}</Text>
                    <Text style={styles.patientMeta}>🩺 {p.doctor_name}  ·  🕐 {p.slot}</Text>
                    <Text style={styles.patientMeta}>📅 {dayLabelFor(p.date)}</Text>
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Text style={styles.tokenChipText}>🎫 {p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.patientActions}>
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => callNext(p.id)}
                      onLongPress={() => noShow(p.id, p.user_name || 'This patient')}
                      delayLongPress={600}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${p.user_name || 'patient'}, token ${p.token}`}
                      accessibilityHint="Double tap to call. Press and hold to mark as no-show."
                    >
                      <Text style={styles.callBtnText}>Call →</Text>
                      <Text style={[styles.btnHint, { color: Colors.white }]}>long-press: no-show</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.holdBtn}
                      onPress={() => toggleHold(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Hold ${p.user_name || 'patient'}, token ${p.token}, and skip to the next patient`}
                    >
                      <Text style={styles.holdBtnText}>⏸ Hold</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.scanShortcutBtn} onPress={() => router.push('/(hospital)/scanner')}>
                      <Text style={styles.scanShortcutText}>📷 Scan</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }

            {fOnHold.length > 0 && (
              <>
                <Text style={[styles.queueSection, { marginTop: 16 }]}>
                  ⏸ On Hold ({fOnHold.length})
                </Text>
                {fOnHold.map((p: Patient) => (
                  <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.gray400 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.patientName}>{p.user_name || 'Patient'}</Text>
                      <Text style={styles.patientMeta}>🩺 {p.doctor_name}  ·  🕐 {p.slot}</Text>
                      <Text style={styles.patientMeta}>📅 {dayLabelFor(p.date)}</Text>
                      <TouchableOpacity
                        style={styles.tokenChip}
                        onPress={() => showTokenDetail(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Token ${p.token}. Tap for details.`}
                      >
                        <Text style={styles.tokenChipText}>🎫 {p.token}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.resumeBtn}
                      onPress={() => toggleHold(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Resume ${p.user_name || 'patient'}, token ${p.token}, back into the waiting queue`}
                    >
                      <Text style={styles.resumeBtnText}>▶ Resume</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <Text style={[styles.queueSection, { marginTop: 16 }]}>
              🔄 In Progress ({fInProgress.length})
            </Text>
            {fInProgress.length === 0
              ? <Text style={styles.emptyMsg}>No one in progress</Text>
              : fInProgress.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.blue400 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{p.user_name || 'Patient'}</Text>
                    <Text style={styles.patientMeta}>🩺 {p.doctor_name}  ·  🕐 {p.slot}</Text>
                    <Text style={styles.patientMeta}>📅 {dayLabelFor(p.date)}</Text>
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Text style={styles.tokenChipText}>🎫 {p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={() => complete(p.id)}
                    onLongPress={() => noShow(p.id, p.user_name || 'This patient')}
                    delayLongPress={600}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${p.user_name || 'patient'} done, token ${p.token}`}
                    accessibilityHint="Double tap to complete. Press and hold to mark as no-show."
                  >
                    <Text style={styles.doneBtnText}>Done ✓</Text>
                    <Text style={[styles.btnHint, { color: Colors.successText }]}>hold: no-show</Text>
                  </TouchableOpacity>
                </View>
              ))
            }

            <Text style={[styles.queueSection, { marginTop: 16 }]}>
              ✅ Completed ({fCompleted.length})
            </Text>
            {fCompleted.length === 0
              ? <Text style={styles.emptyMsg}>None completed yet</Text>
              : fCompleted.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.successText, opacity: 0.7 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{p.user_name || 'Patient'}</Text>
                    <Text style={styles.patientMeta}>🩺 {p.doctor_name}  ·  🕐 {p.slot}</Text>
                    <Text style={styles.patientMeta}>📅 {dayLabelFor(p.date)}</Text>
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Text style={styles.tokenChipText}>🎫 {p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedText}>✅ Done</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DOCTORS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'doctors' && (
          <View style={{ padding: 16 }}>

            <TouchableOpacity style={styles.addDoctorBtn} onPress={openAdd}>
              <Text style={styles.addDoctorBtnText}>+ Add New Doctor</Text>
            </TouchableOpacity>

            {loading ? (
              <ActivityIndicator color={Colors.blue600} style={{ marginTop: 40 }} />
            ) : doctors.length === 0 ? (
              <View style={styles.emptyDoctors}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>👨‍⚕️</Text>
                <Text style={styles.emptyDoctorsTitle}>No Doctors Added Yet</Text>
                <Text style={styles.emptyDoctorsSub}>Tap "+ Add New Doctor" to get started</Text>
              </View>
            ) : (
              doctors.map((doc: Doctor) => {
                const hasDoctorImg   = isValidImage(doc.image);
                const hasHospitalImg = isValidImage(doc.hospital_image);

                return (
                  <View key={String(doc.id)} style={styles.doctorCard}>

                    {/* ── Hospital Banner ── */}
                    <View style={styles.doctorBanner}>
                      {hasHospitalImg ? (
                        <Image source={{ uri: doc.hospital_image }} style={styles.doctorBannerImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.doctorBannerPlaceholder}>
                          <Text style={{ fontSize: 28 }}>🏥</Text>
                          <Text style={styles.doctorBannerText}>{hospital.name}</Text>
                        </View>
                      )}
                      <View style={[
                        styles.availPill,
                        {
                          backgroundColor: doc.available ? Colors.successBg  : Colors.errorBg,
                          borderColor:     doc.available ? Colors.successBorder : Colors.errorBorder,
                        },
                      ]}>
                        <View style={{
                          width: 6, height: 6, borderRadius: 3,
                          backgroundColor: doc.available ? Colors.successText : Colors.errorText,
                          marginRight: 4,
                        }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: doc.available ? Colors.successText : Colors.errorText }}>
                          {doc.available ? 'Available' : 'Unavailable'}
                        </Text>
                      </View>
                    </View>

                    {/* ── Doctor Profile Row ── */}
                    <View style={styles.doctorProfileRow}>
                      {hasDoctorImg ? (
                        <Image source={{ uri: doc.image }} style={styles.doctorProfileImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.doctorProfilePlaceholder}>
                          <Text style={{ fontSize: 28 }}>🩺</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.doctorName}>Dr. {doc.name}</Text>
                        <Text style={styles.doctorSpec}>{doc.specialization}</Text>
                        <Text style={styles.doctorMeta}>📱 {doc.mobile}  ·  ⏳ {doc.experience}y exp</Text>
                        <Text style={styles.doctorMeta}>💰 ₹{doc.fee}  ·  👥 Max {doc.max_per_slot}/slot</Text>
                      </View>
                    </View>

                    {/* ── Days Preview ── */}
                    {doc.days && doc.days.length > 0 && (
                      <View style={styles.slotPreviewRow}>
                        <Text style={styles.slotPreviewLabel}>📅 Days:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                          {doc.days.map((d: string) => (
                            <View key={d} style={styles.slotPreviewChip}>
                              <Text style={styles.slotPreviewText}>{d}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* ── Slot Preview ── */}
                    {doc.slots && doc.slots.length > 0 && (
                      <View style={styles.slotPreviewRow}>
                        <Text style={styles.slotPreviewLabel}>🕐 {doc.slots.length} slots:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
                          {doc.slots.slice(0, 5).map((s: string) => (
                            <View key={s} style={styles.slotPreviewChip}>
                              <Text style={styles.slotPreviewText}>{s}</Text>
                            </View>
                          ))}
                          {doc.slots.length > 5 && (
                            <View style={styles.slotPreviewChip}>
                              <Text style={styles.slotPreviewText}>+{doc.slots.length - 5} more</Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}

                    {/* ── Action Buttons ── */}
                    <View style={styles.doctorActions}>
                      <TouchableOpacity
                        style={[styles.availBtn, doc.available ? styles.availBtnOn : styles.availBtnOff]}
                        onPress={() => toggleAvail(doc)}
                        disabled={toggling === doc.id}
                      >
                        {toggling === doc.id ? (
                          <ActivityIndicator size="small" color={Colors.blue600} />
                        ) : (
                          <Text style={styles.availBtnText}>
                            {doc.available ? '✅ Available' : '❌ Unavailable'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(doc)}>
                        <Text style={styles.editBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDoctor(doc)}>
                        <Text style={styles.deleteBtnText}>🗑</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  navbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  navLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  navRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 18, fontWeight: '800', color: Colors.blue600 },
  profileBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },
  profileBtnText: { fontSize: 16 },
  navTitle:  { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  liveRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.successText },
  liveText:  { fontSize: 11, color: Colors.gray400 },
  logoutBtn: { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { fontSize: 13, fontWeight: '700', color: Colors.errorText },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  statCard:  { width: '47%', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, padding: 16, alignItems: 'center' },
  statNum:   { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 12, color: Colors.gray400 },

  tabRow:        { flexDirection: 'row', marginHorizontal: 16, backgroundColor: Colors.blue50, borderRadius: 12, padding: 4, gap: 4 },
  tab:           { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive:     { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, elevation: 1 },
  tabText:       { fontSize: 13, fontWeight: '500', color: Colors.gray400 },
  tabTextActive: { color: Colors.blue700, fontWeight: '700' },

  // ── Day filter pills (Today / Tomorrow / All) ──
  dayFilterRow:           { flexDirection: 'row', gap: 8, marginBottom: 14 },
  dayPill:                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 6 },
  dayPillText:            { fontSize: 12, fontWeight: '700', color: Colors.gray500 },
  dayPillCount:           { fontSize: 11, fontWeight: '800', color: Colors.gray400, backgroundColor: Colors.blue50, borderRadius: 8, minWidth: 18, textAlign: 'center', paddingHorizontal: 5, overflow: 'hidden' },
  dayPillTextActive:      { color: Colors.white },
  dayPillTodayActive:     { backgroundColor: Colors.blue600,     borderColor: Colors.blue600 },
  dayPillTomorrowActive:  { backgroundColor: Colors.warningText, borderColor: Colors.warningText },
  dayPillAllActive:       { backgroundColor: Colors.gray600,     borderColor: Colors.gray600 },

  queueSection: { fontSize: 14, fontWeight: '800', color: Colors.gray800, marginBottom: 10 },
  emptyMsg:     { fontSize: 13, color: Colors.gray400, textAlign: 'center', padding: 20, fontStyle: 'italic' },
  patientCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 12 },
  patientName:  { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  patientMeta:  { fontSize: 12, color: Colors.gray500, marginBottom: 2 },
  tokenChip:    { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6 },
  tokenChipText:{ fontSize: 12, fontWeight: '800', color: Colors.blue700, letterSpacing: 0.3 },
  patientActions:   { gap: 6, alignItems: 'stretch' },
  callBtn:      { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center' },
  callBtnText:  { color: Colors.white, fontWeight: '700', fontSize: 13 },
  btnHint:      { fontSize: 10, opacity: 0.75, marginTop: 2, textAlign: 'center' as const },
  scanShortcutBtn:  { borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center' },
  scanShortcutText: { color: Colors.blue700, fontWeight: '700', fontSize: 12 },
  holdBtn:      { borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center' },
  holdBtnText:  { color: Colors.warningText, fontWeight: '700', fontSize: 12 },
  resumeBtn:    { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  resumeBtnText:{ color: Colors.white, fontWeight: '700', fontSize: 13 },
  doneBtn:      { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  doneBtnText:  { color: Colors.successText, fontWeight: '700', fontSize: 13 },
  completedBadge: { backgroundColor: Colors.successBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  completedText:  { fontSize: 12, fontWeight: '600', color: Colors.successText },

  addDoctorBtn:      { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginBottom: 16, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  addDoctorBtnText:  { color: Colors.white, fontWeight: '700', fontSize: 15 },
  emptyDoctors:      { alignItems: 'center', padding: 40 },
  emptyDoctorsTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray600, marginBottom: 8 },
  emptyDoctorsSub:   { fontSize: 14, color: Colors.gray400, textAlign: 'center' },

  doctorCard: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 18, marginBottom: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },

  doctorBanner:            { height: 100, backgroundColor: Colors.blue50, position: 'relative' },
  doctorBannerImg:         { width: '100%', height: '100%' },
  doctorBannerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  doctorBannerText:        { fontSize: 12, color: Colors.gray500, fontWeight: '600' },
  availPill:               { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },

  doctorProfileRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, paddingTop: 0, marginTop: -30 },
  doctorProfileImg:         { width: 70, height: 70, borderRadius: 14, borderWidth: 3, borderColor: Colors.white, flexShrink: 0 },
  doctorProfilePlaceholder: { width: 70, height: 70, borderRadius: 14, borderWidth: 3, borderColor: Colors.white, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  doctorName:               { fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 2, marginTop: 32 },
  doctorSpec:               { fontSize: 12, fontWeight: '600', color: Colors.blue600, marginBottom: 5 },
  doctorMeta:               { fontSize: 11, color: Colors.gray400, marginBottom: 2 },

  slotPreviewRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  slotPreviewLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '600', flexShrink: 0 },
  slotPreviewChip:  { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  slotPreviewText:  { fontSize: 10, color: Colors.blue700, fontWeight: '500' },

  doctorActions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  availBtn:      { flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  availBtnOn:    { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder },
  availBtnOff:   { backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200 },
  availBtnText:  { fontSize: 12, fontWeight: '700', color: Colors.gray700 },
  editBtn:       { flex: 1.2, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  editBtnText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  deleteBtn:     { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  deleteBtnText: { fontSize: 14 },

  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  modalCancel:     { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  modalCancelText: { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  modalTitle:      { fontSize: 14, fontWeight: '800', color: Colors.gray900, flex: 1, textAlign: 'center', marginHorizontal: 6 },
  modalSave:       { backgroundColor: Colors.blue600, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 8, minWidth: 58, alignItems: 'center' },
  modalSaveText:   { color: Colors.white, fontWeight: '700', fontSize: 14 },

  modalBody:    { padding: 20 },
  formSection:  { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginTop: 20, marginBottom: 14, textTransform: 'uppercase' },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  fieldInput:   { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900, marginBottom: 14 },
  fieldRow:     { flexDirection: 'row' },
  switchRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 14, marginBottom: 14 },

  imageRow:             { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 6 },
  doctorImgPreview:     { width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue200, flexShrink: 0 },
  doctorImgPlaceholder: { width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  imagePickerCol:       { flex: 1, gap: 7 },
  pickImageBtn:         { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  pickImageBtnText:     { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  removeImageBtn:       { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  removeImageBtnText:   { fontSize: 12, fontWeight: '700', color: Colors.errorText },
  imageHint:            { fontSize: 11, color: Colors.gray400 },

  hospitalBannerPreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  hospitalBannerPreview:     { width: '100%', height: 110, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue200 },
  bannerRemoveBtn:           { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(163,45,45,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  bannerRemoveBtnText:       { fontSize: 12, fontWeight: '700', color: '#fff' },
  hospitalBannerPlaceholder: { width: '100%', height: 90, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  slotActions:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  slotActionBtn:    { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8 },
  slotActionText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  slotWarning:      { backgroundColor: Colors.errorBg, borderRadius: 10, padding: 10, marginBottom: 12 },
  slotSectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  slotGrid:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip:             { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50 },
  dayChip:              { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.gray50 },
  slotChipActive:       { backgroundColor: Colors.blue600, borderColor: Colors.blue600 },
  slotChipText:         { fontSize: 12, fontWeight: '500', color: Colors.gray600 },
  slotChipTextActive:   { color: Colors.white, fontWeight: '700' },
});