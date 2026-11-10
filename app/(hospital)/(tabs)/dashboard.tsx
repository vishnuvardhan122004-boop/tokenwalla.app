/**
 * HospitalDashboard.tsx  — React Native / Expo (TypeScript)
 *
 * Fixes applied:
 *  - Explicit TypeScript interfaces for Doctor, Patient, Queue, Hospital
 *  - useState typed correctly — no more `never[]` errors
 *  - ImageFile interface for typed image state (fixes SetStateAction<null> errors)
 *  - All function parameters explicitly typed
 *  - hospital null-checks with optional chaining
 *  - expo-image-picker properly imported and typed
 *
 * Install dependencies first:
 *   npx expo install expo-image-picker expo-media-library
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { appendKeyword, suggestKeywordsForList } from '../../../constants/searchKeywords';
import { suggestSpecializations } from '../../../constants/specializations';
import NotificationBell from '../../../components/NotificationBell';
import { StaffIncentiveCard } from '../../../components/StaffIncentive';
import DeskStaffBar from '../../../components/DeskStaffBar';
import DeskPicker, { changeHandledBy, staffTodayMessage, useDeskStaff } from '../../../components/DeskPicker';
import API, { apiMessage, logoutUser } from '../../../services/api';
import {
  asList, KIND_TO_SEGMENT, SEG_BLOOD, SEG_CONSULT, SEG_SCAN,
} from '../../../utils/scanCenters';
import { DAYS_OF_WEEK, DEFAULT_SLOTS } from '../../../constants/slots';
import { applyUpdate, DayPicker, SlotPicker } from '../../../components/SchedulePicker';
import ScanEditorModal, { type ScanRecord } from '../../../components/ScanEditorModal';
import ScansPanel from '../../../components/ScansPanel';
import PosterModal from '../../../components/PosterModal';
import type { PosterTarget } from '../../../utils/poster';
import { suggestionsFor } from '../../../constants/testSuggestions';
import { notifyHospitalNewBooking, registerPushToken } from '../../../services/notifications';
import BookingNoticePicker from '../../../components/BookingNoticePicker';
import BookingWindowPicker from '../../../components/BookingWindowPicker';
import { providerLabel, toLocalISODate } from '../../../utils/booking';
import { formatDelay } from '../../../utils/formatDelay';
import { usePolling } from '../../../hooks/usePolling';
import { pickDocumentPhoto } from '../../../utils/imagePicker';
import { tenDigitMobile } from '../../../utils/phone';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hospital {
  id: number | string;
  name: string;
  city?: string;
  /** Identity — the badge and the labels. Says nothing about what is sold. */
  kind?: string;
  /** What is actually sold, e.g. ['CONSULT','SCAN']. Absent on old backends. */
  segments?: string[];
}

// The editor owns this shape. A narrower local copy would type-check and then
// silently PATCH away every field it did not know about — description, keywords,
// days, collection mode — the first time a centre edited a scan.
type Scan = ScanRecord;

interface Doctor {
  id: number | string;
  name: string;
  specialization: string;
  keywords?: string;
  mobile: string;
  landline?: string;
  // Served only to the owning hospital / admin — see
  // DoctorSerializer.to_representation on the backend. Absent for anyone else,
  // which is why it is optional here.
  whatsapp_number?: string;
  experience: number | string;
  fee: number | string;
  max_per_slot: number | string;
  booking_cutoff_hours?: number | null;
  /** How many days past today a patient may book; null / absent = no limit. */
  max_days_ahead?: number | null;
  // Priority booking (0 = off). Absent on a backend that predates it.
  priority_fee?: number;
  priority_per_slot?: number;
  /** The doctor's note to patients, shown on their token. */
  instructions?: string;
  available: boolean;
  running_delay_minutes?: number;
  /** Upcoming days the doctor is on leave. Absent on a backend that predates it. */
  leave_dates?: { date: string; reason?: string }[];
  slots: string[];
  days?: string[];
  image?: string;
  hospital_image?: string;
}

interface Patient {
  id: number | string;
  user_name?: string;
  user_mobile?: string;
  patient_name?: string;   // the beneficiary when booked for someone else
  patient_mobile?: string;
  is_for_other?: boolean;
  doctor_name?: string;
  slot?: string;
  token?: string | number;
  date?: string; // "YYYY-MM-DD" from the backend BookingSerializer
  provider_kind?: string; // 'DOCTOR' | 'SCAN'
  is_priority?: boolean;  // paid to be called first in its slot
  completed_by_staff_id?: number | null;  // who handled it at the desk (web ROADMAP 71)
  completed_by_name?: string | null;
  earns_incentive?: boolean;  // pays the staff incentive (web ROADMAP 71b)
  staff_picked?: boolean;     // someone was already named at the scan
}

// Who the visit is FOR — the beneficiary when it was booked for someone else.
// The queue showed the ACCOUNT holder, so reception called the son for the
// mother while the QR scanner said her name (web audit HD-3, same defect).
const nameOf   = (p: Patient): string => p.patient_name || p.user_name || '';
const mobileOf = (p: Patient) => p.patient_mobile || p.user_mobile || '';

interface QueueState {
  waiting: Patient[];
  onHold: Patient[];
  inProgress: Patient[];
  completed: Patient[];
}

interface FormState {
  name: string;
  specialization: string;
  keywords: string;
  mobile: string;
  landline: string;
  whatsapp_number: string;
  experience: string;
  fee: string;
  max_per_slot: string;
  booking_cutoff_hours: string;   // '' = use the platform default
  max_days_ahead: string;         // '' = no limit
  priority_fee: string;           // '' / '0' = no priority booking
  priority_per_slot: string;
  instructions: string;
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

// Mirrors backend/tokenwalla/utils.py — a mobile is the only number WhatsApp
// can reach; a landline is a call-us number for clinics that have nothing else.
const MOBILE_RE   = /^[6-9][0-9]{9}$/;
const LANDLINE_RE = /^0[1-9][0-9]{1,3}[- ]?[0-9]{6,8}$/;


// The running-late timer: any 5-minute step up to 3 hours (backend/doctors/
// views.py DELAY_MAX_MINUTES / DELAY_STEP_MINUTES). Mirrors
// src/hospital/Hdashboard.js on the website. No slider: react-native ships none
// and a native slider package would force a native rebuild, so − / + step by 5
// and the quick buttons jump. The draft is what staff have dialled in but not
// yet sent; nothing reaches a patient until Notify / Update.
const DELAY_MAX = 180;
const DELAY_STEP = 5;
const DELAY_DEFAULT = 15;
const DELAY_QUICK = [15, 30, 60, 120, 180];

// "On leave" (ROADMAP 61): one closed day, with an optional reason the patients
// see. The server caps the reason at 120; Save is disabled past it rather than
// using maxLength, which would clip a paste without telling anyone.
const LEAVE_REASON_MAX = 120;
const LEAVE_DAY_CHOICES = 14;
// Keys are the backend's closed set; the server maps them to the patient text.
const DELAY_REASONS: [string, string][] = [
  ['surgery', 'In surgery'],
  ['emergency', 'Emergency'],
  ['on_the_way', 'On the way'],
];
// `base` is the doctor's server-side running_delay_minutes when the draft began.
// If the server value has since moved (cleared or changed from another device),
// the draft is stale and draftFor ignores it.
interface DelayDraft { minutes: number; reason: string; base: number }


const EMPTY_FORM: FormState = {
  name:           '',
  specialization: '',
  keywords:       '',
  mobile:         '',
  landline:       '',
  whatsapp_number: '',
  experience:     '',
  fee:            '',
  max_per_slot:   '10',
  booking_cutoff_hours: '',
  max_days_ahead: '',
  priority_fee:   '',
  priority_per_slot: '2',
  instructions:   '',
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

/**
 * Field → message for the doctor form. Mirrors the website's validate()
 * (src/hospital/Hdashboard.js) so both front-ends reject the same things —
 * including the numeric ranges the app used to let through and the backend
 * then rejected with a raw DRF error.
 */
function validateDoctor(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  const num = (v: string) => Number(v);

  if (!f.name.trim())                  e.name = 'Doctor name is required.';
  else if (f.name.trim().length < 2)   e.name = 'Name must be at least 2 characters.';

  if (!f.specialization.trim())        e.specialization = 'Specialization is required.';

  const mobile   = f.mobile.trim();
  const landline = f.landline.trim();
  if (mobile && !MOBILE_RE.test(mobile))
    e.mobile = 'Enter a valid 10-digit Indian mobile number.';
  if (landline && !LANDLINE_RE.test(landline))
    e.landline = 'Enter a valid landline with the STD code, e.g. 08812-234567.';
  if (!mobile && !landline)
    e.mobile = 'Enter a mobile number or a landline.';

  // Optional — blank means this doctor isn't WhatsApped about bookings. A typo
  // is silent in production (nothing ever arrives), so catch it at the form.
  const whatsapp = f.whatsapp_number.trim();
  if (whatsapp && !MOBILE_RE.test(whatsapp))
    e.whatsapp_number = 'Enter a valid 10-digit Indian mobile number.';

  if (f.experience !== '' && (isNaN(num(f.experience)) || num(f.experience) < 0))
    e.experience = 'Experience must be a positive number.';

  if (f.fee !== '' && (isNaN(num(f.fee)) || num(f.fee) < 0))
    e.fee = 'Fee must be a positive number.';

  if (f.max_per_slot !== '' && (isNaN(num(f.max_per_slot)) || num(f.max_per_slot) < 1))
    e.max_per_slot = 'Must be at least 1 patient per slot.';

  if (f.days.length === 0)             e.days = 'Select at least one available day.';
  // No slot requirement on purpose: a walk-in clinic cannot promise a time.
  // Zero slots lists the doctor without online booking — patients see the
  // hospital's hours and call. Days still say which days the doctor sits.

  return e;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function HospitalDashboard() {
  const router = useRouter();

  const [hospital,   setHospital]   = useState<Hospital | null>(null);
  const [activeTab,  setActiveTab]  = useState<'queue' | 'doctors'>('queue');
  // Which day's bookings the queue shows. The queue endpoint returns bookings
  // from ALL dates mixed together, so staff need to split them by day.
  const [dayFilter,  setDayFilter]  = useState<'today' | 'tomorrow' | 'all'>('today');
  const [showDone,   setShowDone]   = useState(false);   // Completed starts closed
  // Signed token of the PIN-signed-in front-desk person (web ROADMAP 69); null = main desk.
  const [deskToken,  setDeskToken]  = useState<string | null>(null);   // PIN token: opens "My earnings" only
  const [pickFor,    setPickFor]    = useState<Patient | null>(null);  // Done waits on "who handled it"
  const [pickBusy,   setPickBusy]   = useState(false);
  // "Lata +₹7 · ₹35 today" with a 10 s Change button (web ROADMAP 71c)
  const [pickToast, setPickToast]   = useState<{ id: number | string; msg: string; staffId: number | null; canChange: boolean; isError?: boolean } | null>(null);
  const [changing,  setChanging]    = useState(false);
  const [mainDeskName, setMainDeskName] = useState('');
  // Re-read on each visit, so a person added on Payments is pickable here.
  const [focusTick,  setFocusTick]  = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick(t => t + 1); }, []));
  const deskStaff = useDeskStaff(hospital?.id, focusTick);
  const [queue,      setQueue]      = useState<QueueState>({ waiting: [], onHold: [], inProgress: [], completed: [] });
  const [doctors,    setDoctors]    = useState<Doctor[]>([]);
  const [scans,      setScans]      = useState<Scan[]>([]);
  // The QR poster being shown (ROADMAP item 58): one doctor's, or this centre's.
  const [poster,     setPoster]     = useState<PosterTarget | null>(null);
  // The tests list's pinned Select bar, drawn here because it sits under the page's
  // ScrollView (see components/ScansPanel.tsx).
  const [scanBar, setScanBar] = useState<ReactNode>(null);
  // null + open = adding; a record + open = editing. Two pieces of state rather
  // than one nullable, so closing the sheet does not blank the row mid-animation.
  // Which completed booking is mid-upload, so only that card shows a spinner.
  const [uploadingFor,  setUploadingFor]  = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [editScan,      setEditScan]      = useState<ScanRecord | null>(null);
  const [loading,    setLoading]    = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [showModal,  setShowModal]  = useState<boolean>(false);
  const [editDoc,    setEditDoc]    = useState<Doctor | null>(null);
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  // Per-field messages shown under the inputs. Cleared for a field as soon as
  // it's edited, so a fixed field stops shouting while you fill the next one.
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [saving,     setSaving]     = useState<boolean>(false);
  const [toggling,   setToggling]   = useState<number | string | null>(null);
  // Per doctor, like the in-flight guard: one shared value let doctor B's request
  // re-enable doctor A's controls while A was still pending.
  const [settingDelay, setSettingDelay] = useState<Set<string>>(new Set());
  const [delayDraft, setDelayDraft] = useState<Record<string, DelayDraft>>({});

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
  }, [router]);

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
      setMainDeskName(typeof data.main_desk_name === 'string' ? data.main_desk_name : '');

      // ── Notify hospital of newly-booked (waiting) patients ──
      // `onHold` belongs in this baseline and was missing. The set means "every
      // booking id already seen", so leaving a bucket out makes those ids look
      // new again the moment they come back: hold a waiting patient and they
      // leave `known`, resume them and the poll announces "New Appointment
      // Booked" for someone who has been at the desk all along. ROADMAP 28,
      // claim 10.
      const allIds = [...waiting, ...onHold, ...inProgress, ...completed]
        .map((p: Patient) => String(p.id));
      if (knownIdsRef.current === null) {
        // First load — seed the baseline, don't notify.
        knownIdsRef.current = new Set(allIds);
      } else {
        const known = knownIdsRef.current;
        for (const p of waiting as Patient[]) {
          if (!known.has(String(p.id))) {
            notifyHospitalNewBooking({
              patientName: nameOf(p),
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

  // What this account SELLS, from the login payload. Falls back to the segment
  // its `kind` implies, so a session opened against an older backend — which
  // sends no `segments` — behaves exactly as it did before capabilities.
  const segments: string[] = Array.isArray(hospital?.segments) && hospital.segments.length
    ? hospital.segments
    : [KIND_TO_SEGMENT[hospital?.kind as string] ?? SEG_CONSULT];

  const sellsConsults = segments.includes(SEG_CONSULT);
  const sellsScans    = segments.includes(SEG_SCAN);
  const sellsBlood    = segments.includes(SEG_BLOOD);

  // SCAN and BLOOD collapse into ONE switcher entry, because they are one list:
  // a Scan row carries no segment of its own, so both would render the same
  // rows and a provider selling both would face two identical tabs. The
  // patient-facing lists still tell them apart — that is a capability question,
  // answered on the server — and this is only about editing the price list.
  //
  // Splitting them here is what Scan.segment would buy, and it is deliberately
  // out of scope for this change.
  const scanLabel = sellsScans && sellsBlood ? 'Scans & Tests'
                  : sellsBlood               ? 'Tests'
                  : 'Scans';
  const providerTabs = [
    ...(sellsConsults
      ? [{ key: SEG_CONSULT, label: 'Doctors',
           icon: 'medkit-outline' as ComponentProps<typeof Ionicons>['name'] }]
      : []),
    ...(sellsScans || sellsBlood
      ? [{ key: 'SERVICES', label: scanLabel,
           icon: (sellsBlood && !sellsScans
             ? 'water-outline' : 'pulse-outline') as ComponentProps<typeof Ionicons>['name'] }]
      : []),
  ];

  const [segTab, setSegTab] = useState<string>(providerTabs[0]?.key ?? SEG_CONSULT);
  // Never leave the tab pointing at something no longer sold — a capability can
  // be switched off in another session while this one is open.
  const seg = providerTabs.some(t => t.key === segTab)
    ? segTab
    : providerTabs[0]?.key ?? SEG_CONSULT;

  const isCentre = seg !== SEG_CONSULT;      // this tab manages Scans, not Doctors
  const isHybrid = providerTabs.length > 1;
  // Blood-only accounts say "Test"; anyone selling scans at all says "Scan".
  const unit = sellsBlood && !sellsScans
    ? { one: 'Test', many: 'Tests' }
    : { one: 'Scan', many: 'Scans' };

  const loadScans = useCallback(async () => {
    if (!hospital?.id) return;
    try {
      const { data } = await API.get('/scans/', { params: { center: hospital.id } });
      setScans(asList<Scan>(data));
    } catch {
      setScans([]);          // an older backend has no /scans/ endpoint
    }
  }, [hospital?.id]);

  useEffect(() => {
    // Gate on what the account SELLS, not on which sub-tab is open. The
    // switcher shows a count per segment, so a hybrid sitting on Doctors still
    // needs its scan count — gating on isCentre left it reading "Scans 0"
    // until you clicked through, which looks like an empty price list.
    if ((sellsScans || sellsBlood) && activeTab === 'doctors') loadScans();
  }, [sellsScans, sellsBlood, activeTab, loadScans]);

  const scanUnit = unit.one.toLowerCase() as 'scan' | 'test';
  // Stable, so the memoised tests panel is not re-rendered by the queue poll.
  const addScan = useCallback(() => { setEditScan(null); setScanModalOpen(true); }, []);
  const editScanRow = useCallback((sc: ScanRecord) => { setEditScan(sc); setScanModalOpen(true); }, []);
  const openCentrePoster = useCallback(() => {
    if (hospital) setPoster({ kind: 'scan', id: hospital.id, name: hospital.name, city: hospital.city });
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
  }, [hospital, loadQueue, loadDoctors]);

  // The queue refreshes every 10s, but only while this screen is focused and
  // the app is in the foreground. This is a Stack, so the dashboard stays
  // mounted behind Payments and Analytics — it used to keep polling from
  // there, and from a locked phone, all day (see hooks/usePolling).
  usePolling(loadQueue, 10_000, !!hospital);

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

  // With desk staff, Done first asks who handled the patient (web ROADMAP 71)
  // and the pick rides Complete as staff_id; with none it completes straight
  // away, sending exactly what it always did (the main desk is credited).
  const sendComplete = async (id: number | string, body?: { staff_id: number | null }) => {
    try {
      const { data } = await (body ? API.patch(`/bookings/complete/${id}/`, body) : API.patch(`/bookings/complete/${id}/`));
      loadQueue();
      if (body) {
        setPickToast({ id, msg: staffTodayMessage(data?.staff_today), staffId: body.staff_id, canChange: true });
      }
      return true;
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.code === 'staff_token_invalid'
        ? apiMessage(e, 'That staff member is not available any more. Pick again.')
        : 'Failed to mark complete');
      return false;
    }
  };
  const complete = (id: number | string) => {
    const p = queue.inProgress.find(x => x.id === id) || queue.waiting.find(x => x.id === id);
    // Ask only when it can earn and nobody was named at the scan (web 71b);
    // otherwise the server keeps the scan's pick.
    if (deskStaff.length > 0 && p?.earns_incentive && !p.staff_picked) setPickFor(p);
    else sendComplete(id);
  };
  const completePicked = async (staffId: number | null) => {
    if (!pickFor) return;
    setPickBusy(true);
    const ok = await sendComplete(pickFor.id, { staff_id: staffId });
    setPickBusy(false);
    if (ok) setPickFor(null);
  };

  // The toast lives 10 s so a mis-tap can be changed; not while the picker is open.
  useEffect(() => {
    if (!pickToast || changing) return undefined;
    const t = setTimeout(() => setPickToast(null), 10000);
    return () => clearTimeout(t);
  }, [pickToast, changing]);
  const changePicked = async (staffId: number | null) => {
    if (!pickToast) return;
    setPickBusy(true);
    const r = await changeHandledBy(pickToast.id, staffId);
    setPickBusy(false);
    setChanging(false);
    setPickToast(r.ok ? { ...pickToast, msg: r.msg, staffId } : { ...pickToast, msg: r.msg, canChange: !r.tooLate, isError: true });
  };

  // Skip a patient who isn't ready without cancelling them. The endpoint is a
  // toggle, so a second tap used to reverse the first — the patient told
  // "your turn is on hold" while still in the queue, or re-held on Resume
  // (web audit HD-4). Saying which way makes the server 409 a repeat; the ref
  // stops a double tap from sending it at all.
  const holding = useRef(new Set<string>());
  const toggleHold = async (id: number | string, action: 'hold' | 'resume') => {
    const key = String(id);
    if (holding.current.has(key)) return;
    holding.current.add(key);
    try { await API.patch(`/bookings/hold/${id}/`, { action }); }
    catch (e) { Alert.alert('Error', apiMessage(e, 'Failed to update hold status')); }
    finally { holding.current.delete(key); loadQueue(); }
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

  // ── Doctor Running Late ────────────────────────────────────────────────────
  const draftFor = (doc: Doctor, drafts: Record<string, DelayDraft> = delayDraft): DelayDraft => {
    const base = doc.running_delay_minutes || 0;
    const draft = drafts[String(doc.id)];
    return draft && draft.base === base ? draft : { minutes: base || DELAY_DEFAULT, reason: '', base };
  };
  const patchDraft = (doc: Doctor, patch: (cur: DelayDraft) => Partial<DelayDraft>) =>
    setDelayDraft(p => {
      const cur = draftFor(doc, p);
      return { ...p, [String(doc.id)]: { ...cur, ...patch(cur) } };
    });
  const clampDelay = (m: number) => Math.min(DELAY_MAX, Math.max(DELAY_STEP, m));

  // Shared tail of set-delay / arrived: reflect the server's flag. The draft is
  // dropped when the delay is gone (the next one starts from the default) and
  // re-based on the new server value otherwise, so the chosen reason stays picked.
  const applyDelayResult = (doc: Doctor, minutes: number) => {
    setDoctors(prev => prev.map(d => (d.id === doc.id ? { ...d, running_delay_minutes: minutes } : d)));
    setDelayDraft(p => {
      const next = { ...p };
      const key = String(doc.id);
      if (minutes && next[key]) next[key] = { ...next[key], base: minutes };
      else delete next[key];
      return next;
    });
  };

  // One request per doctor in flight. `disabled` only lands on the next render,
  // so a double tap inside one tick would otherwise push every patient twice
  // (the same fix Hold got in the queue; see hospitalDashboard.queue.test.tsx).
  const delayInFlight = useRef<Set<string>>(new Set());
  const withDelaySaving = async (doc: Doctor, fn: () => Promise<void>) => {
    const key = String(doc.id);
    if (delayInFlight.current.has(key)) return;
    delayInFlight.current.add(key);
    setSettingDelay(prev => new Set(prev).add(key));
    try {
      await fn();
    } catch (e) {
      Alert.alert('Error', extractApiError(e, 'Failed to update delay.'));
    } finally {
      delayInFlight.current.delete(key);
      setSettingDelay(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const setDoctorDelay = (doc: Doctor, minutes: number, reason = '') => withDelaySaving(doc, async () => {
    const { data } = await API.post(
      `/doctors/${doc.id}/set-delay/`,
      { delay_minutes: minutes, ...(reason ? { reason } : {}) },
      { headers: { 'Content-Type': 'application/json' } },
    );
    applyDelayResult(doc, data.running_delay_minutes);
    Alert.alert('Updated', minutes > 0
      ? `${providerLabel(doc.name, 'DOCTOR')} marked ${formatDelay(minutes)} late. ${data.notified_count} patients notified.`
      : `${providerLabel(doc.name, 'DOCTOR')}'s delay cleared.`);
  });

  // Unlike Clear (silent, for a mistaken tap) this tells today's patients the
  // doctor is in. The server no-ops when no delay is active.
  const markDoctorArrived = (doc: Doctor) => withDelaySaving(doc, async () => {
    const { data } = await API.post(
      `/doctors/${doc.id}/arrived/`,
      {},
      { headers: { 'Content-Type': 'application/json' } },
    );
    applyDelayResult(doc, 0);
    // Arrived is push-only (no approved WhatsApp template yet), and notified_count
    // is every confirmed booking today, walk-ins and website-only patients
    // included, so "N patients notified" would claim delivery that didn't happen.
    const n = data.notified_count;
    Alert.alert('Updated', n > 0
      ? `${providerLabel(doc.name, 'DOCTOR')} marked arrived. Patients with the app were notified; WhatsApp-only patients were not (${n} booked today).`
      : `${providerLabel(doc.name, 'DOCTOR')} marked arrived.`);
  });

  // ── Share a document with the patient ─────────────────────────────────────
  // The stage a visit does not end at: the scan report, the lab result, the
  // discharge summary all come back hours or days later. The server notifies
  // the patient; this screen never sees the file again, because it is medical
  // PII served only through the ownership-checked download endpoint — a storage
  // URL would be a bearer token anyone could forward.
  //
  // Three sources, because a phone IS the scanner in a small clinic: most
  // reports here are a printed sheet someone photographs at the desk, not a PDF
  // that already exists in Files.
  // A real modal, not Alert.alert with three buttons: React Native Web renders
  // a multi-button Alert as NOTHING AT ALL, so on the web build the Share button
  // silently did nothing. One <Modal> works on every platform, and a sheet is
  // the right shape for a source picker anyway.
  const [shareFor, setShareFor] = useState<Patient | null>(null);

  const chooseSource = (source: 'camera' | 'library' | 'file') => {
    const p = shareFor;
    setShareFor(null);
    if (p) sendDocument(p, source);
  };

  const sendDocument = async (p: Patient, source: 'camera' | 'library' | 'file') => {
    let picked: { uri: string; name: string; type: string; file?: File } | null = null;

    if (source === 'file') {
      // Lazy require: expo-document-picker is a native module, and importing it
      // at module scope would run on every dashboard mount.
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      picked = {
        uri:  a.uri,
        name: a.name || 'document.pdf',
        type: a.mimeType || 'application/pdf',
        file: (a as { file?: File }).file,
      };
    } else {
      picked = await pickDocumentPhoto(source);
    }
    if (!picked) return;

    setUploadingFor(String(p.id));
    try {
      const fd = new FormData();
      // The real File on web, the { uri, name, type } shape on native. Sending
      // the native shape on web posts a `blob:` URL as text and the server sees
      // no file at all.
      //
      // The third argument is load-bearing: a File carries its OWN name, which
      // overrides anything computed here — and a camera capture produces an
      // extension-less name like "photo", which the server's allow-list then
      // rejects as not-an-image. Naming the part explicitly is what makes a
      // photographed report upload at all.
      if (picked.file) fd.append('file', picked.file, picked.name);
      else fd.append('file', picked as unknown as Blob);
      fd.append('title', `${p.doctor_name || unit.one} — ${picked.name}`);
      await API.post(`/bookings/${p.id}/reports/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('Document shared', 'The patient has been notified.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not share the document.');
    } finally {
      setUploadingFor(null);
    }
  };

  // ── Delete Doctor ─────────────────────────────────────────────────────────
  const deleteDoctor = (doc: Doctor) => {
    Alert.alert(
      'Delete Doctor',
      `Are you sure you want to delete ${providerLabel(doc.name)}?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await API.delete(`/doctors/${doc.id}/`);
              loadDoctors();
            } catch (e) {
              // The server says why — live bookings, or (since web #135)
              // payment or document history that must be kept.
              Alert.alert('Error', apiMessage(e, 'Failed to delete. The doctor may have active bookings.'));
            }
          },
        },
      ],
    );
  };

  // ── On leave (one closed day) ─────────────────────────────────────────────
  const [leaveFor,    setLeaveFor]    = useState<Doctor | null>(null);
  const [leaveDate,   setLeaveDate]   = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSaving, setLeaveSaving] = useState(false);

  const openLeave = (doc: Doctor) => { setLeaveFor(doc); setLeaveDate(''); setLeaveReason(''); };
  const leaveDays = (doc: Doctor): string[] => {
    const n = Math.min(LEAVE_DAY_CHOICES, doc.max_days_ahead != null ? doc.max_days_ahead + 1 : LEAVE_DAY_CHOICES);
    return Array.from({ length: n }, (_, i) => toLocalISODate(new Date(Date.now() + i * 86400000)));
  };
  const saveLeave = async () => {
    if (!leaveFor) return;
    setLeaveSaving(true);
    try {
      const { data } = await API.post(`/doctors/${leaveFor.id}/leave/`, { date: leaveDate, reason: leaveReason.trim() });
      const id = leaveFor.id;
      setDoctors(prev => prev.map(d => (d.id === id ? {
        ...d,
        leave_dates: [...(d.leave_dates || []).filter(l => l.date !== data.date), { date: data.date, reason: data.reason }]
          .sort((a, b) => a.date.localeCompare(b.date)),
      } : d)));
      setLeaveFor(null);
      Alert.alert('Updated', data.affected > 0
        ? `${data.affected} patient${data.affected === 1 ? '' : 's'} notified`
        : 'Leave saved. No patients were booked that day.');
    } catch (e) {
      Alert.alert('Error', extractApiError(e, 'Failed to save leave.'));
    } finally {
      setLeaveSaving(false);
    }
  };
  const removeLeave = async (doc: Doctor, date: string) => {
    try {
      await API.delete(`/doctors/${doc.id}/leave/`, { params: { date } });
      setDoctors(prev => prev.map(d => (d.id === doc.id
        ? { ...d, leave_dates: (d.leave_dates || []).filter(l => l.date !== date) } : d)));
      Alert.alert('Updated', 'Day reopened.');
    } catch (e) {
      Alert.alert('Error', extractApiError(e, 'Failed to reopen the day.'));
    }
  };

  // ── Modal: open for Add ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditDoc(null);
    setForm(EMPTY_FORM);
    setErrors({});
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
      keywords:       doc.keywords        || '',
      mobile:         doc.mobile          || '',
      landline:       doc.landline        || '',
      whatsapp_number: doc.whatsapp_number || '',
      experience:     String(doc.experience   || ''),
      fee:            String(doc.fee          || ''),
      max_per_slot:   String(doc.max_per_slot || 10),
      booking_cutoff_hours: doc.booking_cutoff_hours == null ? '' : String(doc.booking_cutoff_hours),
      max_days_ahead: doc.max_days_ahead == null ? '' : String(doc.max_days_ahead),
      priority_fee:   doc.priority_fee ? String(doc.priority_fee) : '',
      priority_per_slot: String(doc.priority_per_slot ?? 2),
      instructions:   doc.instructions    || '',
      available:      doc.available       ?? true,
      slots:          doc.slots           || [],
      days:           doc.days            || [],
    });
    setErrors({});
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

  // ── Field edit: set the value and drop that field's error ─────────────────
  const setField = (field: keyof FormState, value: string) => {
    setForm(p => ({ ...p, [field]: value }));
    setErrors(p => (p[field] ? { ...p, [field]: '' } : p));
  };

  const specSuggestions    = suggestSpecializations(form.specialization);
  const keywordSuggestions = suggestKeywordsForList(form.keywords, 8);

  // ── Submit doctor form ────────────────────────────────────────────────────
  const submitForm = async () => {
    const errs = validateDoctor(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      // The messages sit under their fields; this points staff at the first one
      // in case it's scrolled off screen.
      Alert.alert('Check the form', Object.values(errs)[0]);
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('name',           form.name.trim());
      payload.append('specialization', form.specialization.trim());
      payload.append('keywords',       form.keywords.trim());
      payload.append('mobile',         form.mobile.trim());
      payload.append('landline',       form.landline.trim());
      // Belt and braces against the bug above: never blank a field we were
      // not served. If the GET ever stops returning whatsapp_number again
      // (a stale token, an older backend, a serializer change), the edit form
      // must leave the stored number alone rather than overwrite it with ''.
      const waTouched = form.whatsapp_number.trim() !== '' || editDoc?.whatsapp_number !== undefined;
      if (waTouched) {
        payload.append('whatsapp_number', form.whatsapp_number.trim());
      }
      payload.append('experience',     form.experience   || '0');
      payload.append('fee',            form.fee          || '0');
      payload.append('max_per_slot',   form.max_per_slot || '10');
      // Empty means "use the platform default": send an empty value so DRF
      // writes NULL. Sending nothing at all would leave a previously-set
      // override in place, so clearing the box would silently do nothing.
      payload.append('booking_cutoff_hours', form.booking_cutoff_hours.trim());
      // Blank is sent too: it writes NULL (no limit). Omitting the key would leave an
      // earlier limit in place, so choosing "No limit" would silently do nothing.
      payload.append('max_days_ahead', form.max_days_ahead.trim());
      // Always sent, blank included, so clearing the box clears it.
      payload.append('instructions',   form.instructions.trim());
      payload.append('available',      String(form.available));
      payload.append('slots',          JSON.stringify(form.slots));
      payload.append('days',           JSON.stringify(form.days));
      // Edit only, and only when the backend served the field: switching
      // priority on needs payout details, which a doctor being created cannot
      // have yet, and an older backend would 400 nothing but ignore it anyway.
      if (editDoc && editDoc.priority_fee !== undefined) {
        payload.append('priority_fee',      String(Number(form.priority_fee) || 0));
        payload.append('priority_per_slot', String(Number(form.priority_per_slot) || 1));
      }

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
        Alert.alert('Updated', `${providerLabel(form.name)} updated successfully!`);
      } else {
        await API.post('/doctors/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        Alert.alert('Added', `${providerLabel(form.name)} added successfully!`);
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

  // The queue re-renders on every toggle, modal and poll tick; filtering the
  // four lists (and counting the day pills) only when the queue or the day
  // filter actually changes keeps that cheap.
  const { fWaiting, fOnHold, fInProgress, fCompleted } = useMemo(() => ({
    fWaiting:    queue.waiting.filter(matchesDay),
    fOnHold:     queue.onHold.filter(matchesDay),
    fInProgress: queue.inProgress.filter(matchesDay),
    fCompleted:  queue.completed.filter(matchesDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [queue, dayFilter, todayYMD, tomorrowYMD]);

  // Counts per day for the filter pills, so staff see at a glance where the
  // patients are without switching tabs.
  // Built once per queue change instead of rebuilding the combined array on
  // each of the three pill lookups.
  const dayCounts = useMemo(() => {
    const all = [...queue.waiting, ...queue.onHold, ...queue.inProgress, ...queue.completed];
    const count = (target: string) => all.filter(p => (p.date || '') === target).length;
    return { all: all.length, today: count(todayYMD), tomorrow: count(tomorrowYMD) };
  }, [queue, todayYMD, tomorrowYMD]);
  const countForDay = (day: 'today' | 'tomorrow' | 'all'): number => dayCounts[day];

  // Tapping a token opens a quick detail popup — handy for reading the token
  // aloud or confirming the patient at the counter. `done` popups (completed
  // bookings) drop the no-show action: that visit already happened.
  const showTokenDetail = (p: Patient, done = false) => {
    Alert.alert(
      `Token ${p.token ?? '—'}`,
      [
        `Patient: ${nameOf(p) || 'Patient'}`,
        mobileOf(p) ? `Mobile: ${mobileOf(p)}` : null,
        p.is_for_other && p.user_name ? `Booked by: ${p.user_name}${p.user_mobile ? ` · ${p.user_mobile}` : ''}` : null,
        p.doctor_name ? `Doctor: ${p.doctor_name}` : null,
        p.slot ? `Slot: ${p.slot}` : null,
        `Day: ${dayLabelFor(p.date)}`,
      ].filter(Boolean).join('\n'),
      done
        ? [{ text: 'Close' }]
        : [
            { text: 'Close', style: 'cancel' },
            {
              text: 'Mark as No-show',
              style: 'destructive',
              onPress: () => noShow(p.id, nameOf(p) || 'This patient'),
            },
          ],
    );
  };

  if (!hospital) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.blue600} />
      </View>
    );
  }

  // Shown over the card list, or INSIDE the doctor form while that is open: iOS
  // cannot present a second root modal on top of the first.
  const leaveModal = (
    <Modal visible={!!leaveFor} transparent animationType="fade" onRequestClose={() => setLeaveFor(null)}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{leaveFor ? providerLabel(leaveFor.name, 'DOCTOR') : ''} on leave</Text>
          <Text style={styles.sheetSub}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(leaveFor ? leaveDays(leaveFor) : []).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.leaveDay, leaveDate === d && styles.delayBtnOn]}
                onPress={() => setLeaveDate(d)}
                accessibilityLabel={`Leave on ${d}`}
                accessibilityRole="button"
                accessibilityState={{ selected: leaveDate === d }}
              >
                <Text style={styles.delayBtnText}>{d.slice(5)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.sheetSub, { marginTop: 12 }]}>Reason (optional)</Text>
          <TextInput
            style={styles.leaveInput}
            placeholder="e.g. Out of station"
            placeholderTextColor={Colors.gray400}
            value={leaveReason}
            onChangeText={setLeaveReason}
            accessibilityLabel="Leave reason"
          />
          <Text style={[styles.leaveCount, leaveReason.length > LEAVE_REASON_MAX && { color: Colors.errorText }]}>
            {leaveReason.length}/{LEAVE_REASON_MAX}
          </Text>
          <Text style={styles.sheetSub}>Patients booked that day get a WhatsApp + app alert and a free reschedule.</Text>
          <View style={styles.delayBtnRow}>
            <TouchableOpacity style={[styles.sheetCancel, { flex: 1, marginTop: 0 }]} onPress={() => setLeaveFor(null)}
              disabled={leaveSaving} accessibilityLabel="Cancel leave">
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetCancel, { flex: 1, marginTop: 0, backgroundColor: Colors.warningBg },
                (leaveSaving || !leaveDate || leaveReason.length > LEAVE_REASON_MAX) && { opacity: 0.5 }]}
              onPress={saveLeave}
              disabled={leaveSaving || !leaveDate || leaveReason.length > LEAVE_REASON_MAX}
              accessibilityLabel="Save leave"
            >
              {leaveSaving
                ? <ActivityIndicator size="small" color={Colors.gray700} />
                : <Text style={styles.sheetCancelText}>Save leave</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {!showModal && leaveModal}

      {/* ══════════════════════════════════════════════════════════════════════
          DOCTOR FORM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {/* A centre's version of the doctor form. Mounted unconditionally: the
          modal itself is hidden until `visible`, and gating it on `isCentre`
          would unmount it mid-dismiss when a kind changes under us. */}
      {!!hospital?.id && (
        <ScanEditorModal
          visible={scanModalOpen}
          scan={editScan}
          unit={unit.one.toLowerCase() as 'scan' | 'test'}
          // A hybrid centre gets both lists, a blood-only lab never an MRI.
          suggestions={suggestionsFor(sellsBlood, sellsScans)}
          centerId={hospital.id}
          onClose={() => setScanModalOpen(false)}
          onSaved={loadScans}
        />
      )}

      {poster && <PosterModal target={poster} onClose={() => setPoster(null)} />}

      {/* ── Share-a-document source picker ── */}
      <Modal visible={!!shareFor} transparent animationType="fade" onRequestClose={() => setShareFor(null)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShareFor(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Share a document</Text>
            <Text style={styles.sheetSub}>
              Send a report, prescription or discharge summary to{' '}
              {(shareFor && nameOf(shareFor)) || 'this patient'}.
            </Text>
            {([
              { icon: 'camera-outline',  label: 'Take a photo',   source: 'camera'  },
              { icon: 'images-outline',  label: 'Choose a photo', source: 'library' },
              { icon: 'document-outline', label: 'Choose a file',  source: 'file'    },
            ] as const).map(o => (
              <TouchableOpacity
                key={o.source}
                style={styles.sheetRow}
                onPress={() => chooseSource(o.source)}
              >
                <Ionicons name={o.icon} size={19} color={Colors.blue700} />
                <Text style={styles.sheetRowText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setShareFor(null)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
          {showModal && leaveModal}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalCancel}>
                <Ionicons name="close" size={15} color={Colors.errorText} />
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <Text style={styles.modalTitle} numberOfLines={1}>
                {editDoc ? `Edit ${providerLabel(editDoc.name)}` : 'Add New Doctor'}
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
              <Text style={styles.fieldLabel}>Doctor Profile Photo</Text>
              <View style={styles.imageRow}>
                {doctorImagePreview ? (
                  <Image
                    source={{ uri: doctorImagePreview }}
                    style={styles.doctorImgPreview}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={180}
                  />
                ) : (
                  <View style={styles.doctorImgPlaceholder}>
                    <Ionicons name="medkit-outline" size={30} color={Colors.blue400} />
                  </View>
                )}

                <View style={styles.imagePickerCol}>
                  <TouchableOpacity style={styles.pickImageBtn} onPress={handlePickDoctorImage}>
                    <Ionicons name={doctorImagePreview ? 'sync-outline' : 'camera-outline'} size={15} color={Colors.blue600} />
                    <Text style={styles.pickImageBtnText}>
                      {doctorImagePreview ? 'Change Photo' : 'Choose Photo'}
                    </Text>
                  </TouchableOpacity>

                  {doctorImagePreview && (
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => { setDoctorImageFile(null); setDoctorImagePreview(null); }}
                    >
                      <Ionicons name="close" size={13} color={Colors.errorText} />
                      <Text style={styles.removeImageBtnText}>Remove</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.imageHint}>Max 5 MB · JPG, PNG, WebP</Text>
                  <Text style={styles.imageHint}>Square crop recommended</Text>
                </View>
              </View>

              {/* Hospital banner image */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Hospital Banner Photo</Text>

              {hospitalImagePreview ? (
                <View style={styles.hospitalBannerPreviewWrap}>
                  <Image
                    source={{ uri: hospitalImagePreview }}
                    style={styles.hospitalBannerPreview}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={180}
                  />
                  <TouchableOpacity
                    style={styles.bannerRemoveBtn}
                    onPress={() => { setHospitalImageFile(null); setHospitalImagePreview(null); }}
                  >
                    <Ionicons name="close" size={13} color={Colors.white} />
                    <Text style={styles.bannerRemoveBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.hospitalBannerPlaceholder}>
                  <Ionicons name="image-outline" size={28} color={Colors.gray400} style={{ marginBottom: 4 }} />
                  <Text style={styles.imageHint}>No banner selected</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.pickImageBtn, { marginTop: 8 }]} onPress={handlePickHospitalImage}>
                <Ionicons name={hospitalImagePreview ? 'sync-outline' : 'camera-outline'} size={15} color={Colors.blue600} />
                <Text style={styles.pickImageBtnText}>
                  {hospitalImagePreview ? 'Change Banner' : 'Choose Banner'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.imageHint, { marginTop: 4 }]}>16:9 landscape · Max 5 MB</Text>

              {/* ── BASIC INFO ─────────────────────────────────────────── */}
              <Text style={styles.formSection}>BASIC INFORMATION</Text>

              <Text style={styles.fieldLabel}>Doctor Name *</Text>
              <TextInput
                style={[styles.fieldInput, errors.name && styles.fieldInputError]}
                placeholder="e.g. Ravi Kumar"
                placeholderTextColor={Colors.gray400}
                value={form.name}
                onChangeText={(v: string) => setField('name', v)}
              />
              <FieldError msg={errors.name} />

              <Text style={styles.fieldLabel}>Specialization *</Text>
              <TextInput
                style={[styles.fieldInput, errors.specialization && styles.fieldInputError]}
                placeholder="e.g. Cardiologist"
                placeholderTextColor={Colors.gray400}
                value={form.specialization}
                onChangeText={(v: string) => setField('specialization', v)}
              />
              <FieldError msg={errors.specialization} />
              {/* Free-text field — these are quick picks that keep spelling
                  consistent, which is what patient search matches on. */}
              {specSuggestions.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                  {specSuggestions.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestChip}
                      onPress={() => setField('specialization', s)}
                    >
                      <Text style={styles.suggestChipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={styles.fieldLabel}>Search Keywords</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. heart, chest pain, BP, ECG"
                placeholderTextColor={Colors.gray400}
                value={form.keywords}
                onChangeText={(v: string) => setField('keywords', v)}
              />
              {/* Completes the term after the last comma and appends it. */}
              {keywordSuggestions.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggestRow}>
                  {keywordSuggestions.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestChip}
                      onPress={() => setField('keywords', appendKeyword(form.keywords, s))}
                    >
                      <Ionicons name="add" size={12} color={Colors.blue700} />
                      <Text style={styles.suggestChipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <Text style={styles.imageHint}>
                Comma-separated terms patients might search — helps this doctor show up in results.
              </Text>

              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <TextInput
                style={[styles.fieldInput, errors.mobile && styles.fieldInputError]}
                placeholder="10-digit mobile"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                value={form.mobile}
                onChangeText={(v: string) => setField('mobile', tenDigitMobile(v))}
              />
              <FieldError msg={errors.mobile} />

              <Text style={styles.fieldLabel}>Landline</Text>
              <TextInput
                style={[styles.fieldInput, errors.landline && styles.fieldInputError]}
                placeholder="08812-234567"
                placeholderTextColor={Colors.gray400}
                keyboardType="phone-pad"
                value={form.landline}
                onChangeText={(v: string) => setField('landline', v.replace(/[^\d\-\s]/g, '').slice(0, 15))}
              />
              <FieldError msg={errors.landline} />
              <Text style={styles.imageHint}>
                Mobile or landline — at least one. Only a mobile receives WhatsApp updates.
              </Text>

              <Text style={styles.fieldLabel}>Doctor's WhatsApp (optional)</Text>
              <TextInput
                style={[styles.fieldInput, errors.whatsapp_number && styles.fieldInputError]}
                placeholder="10-digit mobile"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                value={form.whatsapp_number}
                onChangeText={(v: string) => setField('whatsapp_number', tenDigitMobile(v))}
              />
              <FieldError msg={errors.whatsapp_number} />
              <Text style={styles.imageHint}>
                Add a number and the doctor gets a WhatsApp message each time a patient
                books them. Leave it blank for no messages.
              </Text>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Experience (years)</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.experience && styles.fieldInputError]}
                    placeholder="e.g. 5"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    value={form.experience}
                    onChangeText={(v: string) => setField('experience', v)}
                  />
                  <FieldError msg={errors.experience} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.fieldLabel}>Fee (₹)</Text>
                  <TextInput
                    style={[styles.fieldInput, errors.fee && styles.fieldInputError]}
                    placeholder="e.g. 300"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="numeric"
                    value={form.fee}
                    onChangeText={(v: string) => setField('fee', v)}
                  />
                  <FieldError msg={errors.fee} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Max Patients Per Slot</Text>
              <TextInput
                style={[styles.fieldInput, errors.max_per_slot && styles.fieldInputError]}
                placeholder="e.g. 10"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
                value={form.max_per_slot}
                onChangeText={(v: string) => setField('max_per_slot', v)}
              />
              <FieldError msg={errors.max_per_slot} />

              <BookingNoticePicker
                value={form.booking_cutoff_hours}
                onChange={(v: string) => setField('booking_cutoff_hours', v)}
              />

              <BookingWindowPicker
                value={form.max_days_ahead}
                onChange={(v: string) => setField('max_days_ahead', v)}
              />

              <Text style={styles.fieldLabel}>Instructions for patients (optional)</Text>
              <TextInput
                style={[styles.fieldInput, { minHeight: 70, textAlignVertical: 'top' }]}
                multiline
                maxLength={1000}
                placeholder="e.g. Bring your previous reports and prescriptions"
                placeholderTextColor={Colors.gray400}
                value={form.instructions}
                onChangeText={(v: string) => setField('instructions', v)}
              />
              <Text style={styles.fieldHint}>Shown to the patient on their token after they book.</Text>

              {editDoc && editDoc.priority_fee !== undefined && (
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Priority Fee (₹)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="0 = off"
                      placeholderTextColor={Colors.gray400}
                      keyboardType="numeric"
                      value={form.priority_fee}
                      onChangeText={(v: string) => setField('priority_fee', v)}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.fieldLabel}>Priority Seats / Slot</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 2"
                      placeholderTextColor={Colors.gray400}
                      keyboardType="numeric"
                      value={form.priority_per_slot}
                      onChangeText={(v: string) => setField('priority_per_slot', v)}
                    />
                  </View>
                </View>
              )}
              {editDoc && editDoc.priority_fee !== undefined && (
                <Text style={{ fontSize: 12, color: Colors.gray400, marginBottom: 12 }}>
                  ₹20–₹200 extra for a patient to be called first in their slot. Paid out
                  to you in full; needs payout details in Payments. 0 = off.
                </Text>
              )}

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.fieldLabel}>Availability</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray400 }}>
                    {form.available ? 'Doctor is available' : 'Doctor is unavailable'}
                  </Text>
                </View>
                <Switch
                  value={form.available}
                  onValueChange={(v: boolean) => setForm(p => ({ ...p, available: v }))}
                  trackColor={{ false: Colors.gray200, true: Colors.blue200 }}
                  thumbColor={form.available ? Colors.blue600 : Colors.gray400}
                />
              </View>
              {editDoc && (
                <TouchableOpacity style={styles.leaveBtn} onPress={() => openLeave(editDoc)} accessibilityLabel="On leave from form">
                  <Text style={styles.delayBtnText}>On leave…</Text>
                </TouchableOpacity>
              )}

              {/* ── AVAILABLE DAYS ────────────────────────────────────── */}
              <Text style={styles.formSection}>
                AVAILABLE DAYS  ({form.days.length} of {DAYS_OF_WEEK.length} selected)
              </Text>

              <DayPicker
                days={form.days}
                onChange={days => {
                  setForm(p => ({ ...p, days: applyUpdate(days, p.days) }));
                  setErrors(p => (p.days ? { ...p, days: '' } : p));
                }}
                note={(
                  <View style={styles.slotWarning}>
                    <Text style={{ fontSize: 13, color: Colors.errorText }}>
                      Please select at least one day
                    </Text>
                  </View>
                )}
              />

              {/* ── SLOTS ─────────────────────────────────────────────── */}
              <Text style={styles.formSection}>
                TIME SLOTS  ({form.slots.length} of {DEFAULT_SLOTS.length} selected)
              </Text>

              <SlotPicker
                slots={form.slots}
                onChange={slots => {
                  setForm(p => ({ ...p, slots: applyUpdate(slots, p.slots) }));
                  setErrors(p => (p.slots ? { ...p, slots: '' } : p));
                }}
                note={(
                  <View style={styles.walkInNote}>
                    <Text style={{ fontSize: 13, color: Colors.blue800, fontWeight: '700', marginBottom: 3 }}>
                      Walk-in mode
                    </Text>
                    <Text style={{ fontSize: 13, color: Colors.blue800, lineHeight: 18 }}>
                      With no slots selected, patients see this doctor as available along with
                      your hospital timings and notice, and call you to visit — there is no
                      online token booking.
                    </Text>
                  </View>
                )}
              />

              <View style={{ height: 50 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.navbar}>
        {/* No back arrow: this is the hospital's home tab (see (tabs)/_layout.tsx).
            It used to go to /(patient)/home, the patient tab bar. */}
        <View style={styles.navLeft}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.navTitle} numberOfLines={1}>{hospital.name}</Text>
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
            <Ionicons name="person" size={18} color={Colors.blue600} />
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
        // The tests search box is in here: without this the first tap after typing
        // (on Select, Edit, a card) only dismisses the keyboard.
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.blue600} />
        }
      >
        {/* ── TABS ── (The 2x2 Total / Waiting / In Progress / Completed tiles that
            sat above these repeated the day pills and the section headings below,
            and put the first patient under the fold.) */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'queue' && styles.tabActive]}
            onPress={() => setActiveTab('queue')}
          >
            <Ionicons name="people-outline" size={15} color={activeTab === 'queue' ? Colors.blue600 : Colors.gray500} />
            <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]} numberOfLines={1}>
              Queue {fWaiting.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'doctors' && styles.tabActive]}
            onPress={() => setActiveTab('doctors')}
          >
            <Ionicons
              name={isHybrid ? 'grid-outline' : (providerTabs[0]?.icon ?? 'medkit-outline')}
              size={15}
              color={activeTab === 'doctors' ? Colors.blue600 : Colors.gray500}
            />
            <Text style={[styles.tabText, activeTab === 'doctors' && styles.tabTextActive]} numberOfLines={1}>
              {isHybrid
                ? 'Services'
                : isCentre ? `${unit.many} ${scans.length}` : `Doctors ${doctors.length}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => router.push('/(hospital)/payments')}
          >
            <Ionicons name="card-outline" size={15} color={Colors.gray500} />
            <Text style={styles.tabText}>Payments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => router.push('/(hospital)/scanner')}
          >
            <Ionicons name="qr-code-outline" size={15} color={Colors.gray500} />
            <Text style={styles.tabText}>Scan QR</Text>
          </TouchableOpacity>
        </View>

        {/* Staff incentive (ROADMAP 60): one line, absent while the flag is off */}
        {hospital?.id != null && <DeskStaffBar hospitalId={hospital.id} token={deskToken} onToken={setDeskToken}
                                                    onManage={() => router.push('/(hospital)/payments')} />}
        {hospital?.id != null && (
          <DeskPicker visible={pickFor !== null || changing} hospitalId={hospital.id} staff={deskStaff}
                      mainName={mainDeskName}
                      patient={!changing && pickFor ? nameOf(pickFor) : undefined}
                      initial={changing ? pickToast?.staffId : pickFor?.completed_by_staff_id}
                      busy={pickBusy} onPick={changing ? changePicked : completePicked}
                      onCancel={() => (changing ? setChanging(false) : setPickFor(null))} />
        )}
        {hospital?.id != null && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <StaffIncentiveCard hospitalId={hospital.id} onOpen={() => router.push('/(hospital)/payments')} />
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            QUEUE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <View style={{ padding: 16 }}>
            {/* ── DAY FILTER: Today / Tomorrow / All ── */}
            <View style={styles.dayFilterRow}>
              {([
                { key: 'today',    label: 'Today',    active: styles.dayPillTodayActive    },
                { key: 'tomorrow', label: 'Tomorrow', active: styles.dayPillTomorrowActive },
                { key: 'all',      label: 'All',      active: styles.dayPillAllActive      },
              ] as const).map(({ key, label, active }) => {
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
                      {label}
                    </Text>
                    <Text style={[styles.dayPillCount, isActive && styles.dayPillTextActive]}>
                      {countForDay(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.queueSection}>Waiting ({fWaiting.length})</Text>
            {fWaiting.length === 0
              ? <Text style={styles.emptyMsg}>No patients waiting</Text>
              : fWaiting.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.warningText }]}>
                  <View style={{ flex: 1 }}>
                    {p.is_priority ? (
                      <Text style={[styles.patientMeta, { color: Colors.warningText, fontWeight: '700' }]}>
                        ★ Priority — call first in slot
                      </Text>
                    ) : null}
                    <Text style={styles.patientName}>{nameOf(p) || 'Patient'}</Text>
                    {p.is_for_other && p.user_name ? <Text style={styles.patientMeta}>Booked by {p.user_name}</Text> : null}
                    <TouchableOpacity
                      onPress={() => mobileOf(p) && Linking.openURL(`tel:${mobileOf(p)}`)}
                      disabled={!mobileOf(p)}
                      accessibilityRole="link"
                      accessibilityLabel={`Call ${nameOf(p) || 'patient'} on ${mobileOf(p)}`}
                    >
                      <Text style={styles.patientPhone}>{mobileOf(p) || 'N/A'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.patientMeta}>{p.doctor_name}  ·  {p.slot}</Text>
                    <Text style={styles.patientMeta}>{dayLabelFor(p.date)}</Text>
                    {p.completed_by_name ? <Text style={[styles.patientMeta, { color: Colors.successText }]}>Handled by {p.completed_by_name}</Text> : null}
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Ionicons name="ticket-outline" size={12} color={Colors.blue700} />
                      <Text style={styles.tokenChipText}>{p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.patientActions}>
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => callNext(p.id)}
                      onLongPress={() => noShow(p.id, nameOf(p) || 'This patient')}
                      delayLongPress={600}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${nameOf(p) || 'patient'}, token ${p.token}`}
                      accessibilityHint="Double tap to call. Press and hold to mark as no-show."
                    >
                      <Text style={styles.callBtnText}>Call →</Text>
                      <Text style={[styles.btnHint, { color: Colors.white }]}>long-press: no-show</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.holdBtn}
                      onPress={() => toggleHold(p.id, 'hold')}
                      accessibilityRole="button"
                      accessibilityLabel={`Hold ${nameOf(p) || 'patient'}, token ${p.token}, and skip to the next patient`}
                    >
                      <Ionicons name="pause" size={13} color={Colors.gray600} />
                      <Text style={styles.holdBtnText}>Hold</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.scanShortcutBtn} onPress={() => router.push('/(hospital)/scanner')}>
                      <Ionicons name="qr-code-outline" size={13} color={Colors.blue600} />
                      <Text style={styles.scanShortcutText}>Scan</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }

            {fOnHold.length > 0 && (
              <>
                <Text style={[styles.queueSection, { marginTop: 16 }]}>
                  On Hold ({fOnHold.length})
                </Text>
                {fOnHold.map((p: Patient) => (
                  <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.gray400 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.patientName}>{nameOf(p) || 'Patient'}</Text>
                    {p.is_for_other && p.user_name ? <Text style={styles.patientMeta}>Booked by {p.user_name}</Text> : null}
                      <TouchableOpacity
                        onPress={() => mobileOf(p) && Linking.openURL(`tel:${mobileOf(p)}`)}
                        disabled={!mobileOf(p)}
                        accessibilityRole="link"
                        accessibilityLabel={`Call ${nameOf(p) || 'patient'} on ${mobileOf(p)}`}
                      >
                        <Text style={styles.patientPhone}>{mobileOf(p) || 'N/A'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.patientMeta}>{p.doctor_name}  ·  {p.slot}</Text>
                      <Text style={styles.patientMeta}>{dayLabelFor(p.date)}</Text>
                      <TouchableOpacity
                        style={styles.tokenChip}
                        onPress={() => showTokenDetail(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Token ${p.token}. Tap for details.`}
                      >
                        <Ionicons name="ticket-outline" size={12} color={Colors.blue700} />
                      <Text style={styles.tokenChipText}>{p.token}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.resumeBtn}
                      onPress={() => toggleHold(p.id, 'resume')}
                      accessibilityRole="button"
                      accessibilityLabel={`Resume ${nameOf(p) || 'patient'}, token ${p.token}, back into the waiting queue`}
                    >
                      <Ionicons name="play" size={13} color={Colors.blue600} />
                      <Text style={styles.resumeBtnText}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {/* An empty section is its heading and nothing else. */}
            <Text style={[styles.queueSection, { marginTop: 16 }, fInProgress.length === 0 && { marginBottom: 0 }]}>
              In Progress ({fInProgress.length})
            </Text>
            {fInProgress.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.blue400 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{nameOf(p) || 'Patient'}</Text>
                    {p.is_for_other && p.user_name ? <Text style={styles.patientMeta}>Booked by {p.user_name}</Text> : null}
                    <TouchableOpacity
                      onPress={() => mobileOf(p) && Linking.openURL(`tel:${mobileOf(p)}`)}
                      disabled={!mobileOf(p)}
                      accessibilityRole="link"
                      accessibilityLabel={`Call ${nameOf(p) || 'patient'} on ${mobileOf(p)}`}
                    >
                      <Text style={styles.patientPhone}>{mobileOf(p) || 'N/A'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.patientMeta}>{p.doctor_name}  ·  {p.slot}</Text>
                    <Text style={styles.patientMeta}>{dayLabelFor(p.date)}</Text>
                    {p.completed_by_name ? <Text style={[styles.patientMeta, { color: Colors.successText }]}>Handled by {p.completed_by_name}</Text> : null}
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Ionicons name="ticket-outline" size={12} color={Colors.blue700} />
                      <Text style={styles.tokenChipText}>{p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={() => complete(p.id)}
                    onLongPress={() => noShow(p.id, nameOf(p) || 'This patient')}
                    delayLongPress={600}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${nameOf(p) || 'patient'} done, token ${p.token}`}
                    accessibilityHint="Double tap to complete. Press and hold to mark as no-show."
                  >
                    <Text style={styles.doneBtnText}>Done ✓</Text>
                    <Text style={[styles.btnHint, { color: Colors.successText }]}>hold: no-show</Text>
                  </TouchableOpacity>
                </View>
              ))
            }

            {/* Read-only history, so it stays closed until asked for; the count
                is on the heading either way. */}
            <TouchableOpacity
              style={[styles.queueFold, { marginTop: 16 }]}
              onPress={() => setShowDone(v => !v)}
              disabled={fCompleted.length === 0}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone && fCompleted.length > 0 }}
              accessibilityLabel={`Completed, ${fCompleted.length} patients`}
            >
              <Text style={[styles.queueSection, { marginBottom: 0 }]}>Completed ({fCompleted.length})</Text>
              {fCompleted.length > 0 && (
                <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray500} />
              )}
            </TouchableOpacity>
            {showDone && fCompleted.map((p: Patient) => (
                <View key={String(p.id)} style={[styles.patientCard, { borderLeftColor: Colors.successText, opacity: 0.7 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{nameOf(p) || 'Patient'}</Text>
                    {p.is_for_other && p.user_name ? <Text style={styles.patientMeta}>Booked by {p.user_name}</Text> : null}
                    <TouchableOpacity
                      onPress={() => mobileOf(p) && Linking.openURL(`tel:${mobileOf(p)}`)}
                      disabled={!mobileOf(p)}
                      accessibilityRole="link"
                      accessibilityLabel={`Call ${nameOf(p) || 'patient'} on ${mobileOf(p)}`}
                    >
                      <Text style={styles.patientPhone}>{mobileOf(p) || 'N/A'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.patientMeta}>{p.doctor_name}  ·  {p.slot}</Text>
                    <Text style={styles.patientMeta}>{dayLabelFor(p.date)}</Text>
                    {deskStaff.length > 0 ? <Text style={[styles.patientMeta, { color: Colors.successText }]}>Completed by {p.completed_by_name || 'Main desk'}</Text> : null}
                    <TouchableOpacity
                      style={styles.tokenChip}
                      onPress={() => showTokenDetail(p, true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Token ${p.token}. Tap for details.`}
                    >
                      <Ionicons name="ticket-outline" size={12} color={Colors.blue700} />
                      <Text style={styles.tokenChipText}>{p.token}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <View style={styles.completedBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={Colors.successText} />
                      <Text style={styles.completedText}>Done</Text>
                    </View>
                    {/* Every provider, not just centres: a hospital's discharge
                        summary is the same object as a centre's scan PDF. */}
                    <TouchableOpacity
                      style={styles.uploadBtn}
                      disabled={uploadingFor === String(p.id)}
                      onPress={() => setShareFor(p)}
                    >
                      {uploadingFor === String(p.id)
                        ? <ActivityIndicator size="small" color={Colors.blue700} />
                        : <>
                            <Ionicons name="cloud-upload-outline" size={14} color={Colors.blue700} />
                            <Text style={styles.uploadBtnText}>Share</Text>
                          </>}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DOCTORS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {/* ── SCANS (a centre's version of the Doctors tab) ── */}
        {/* ── Segment switcher — only when this account sells more than one
            thing. One provider tab with a switcher rather than a tab each:
            three provider tabs would take the bar to six and clip off a
            375pt screen, which is exactly the bug the patient tabs just had. */}
        {activeTab === 'doctors' && isHybrid && (
          <View style={styles.segRow}>
            {providerTabs.map(t => {
              const on = t.key === seg;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.segBtn, on && styles.segBtnOn]}
                  onPress={() => setSegTab(t.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={t.icon} size={14}
                    color={on ? Colors.blue700 : Colors.gray500} />
                  <Text numberOfLines={1} style={[styles.segText, on && styles.segTextOn]}>
                    {t.label} {t.key === SEG_CONSULT ? doctors.length : scans.length}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {activeTab === 'doctors' && isCentre && (
          // Mounted only on this tab, so leaving it (to Queue, or to Doctors inside
          // Services) unmounts the panel and clears a half-made selection.
          <ScansPanel
            scans={scans}
            loadScans={loadScans}
            centerId={hospital?.id}
            unit={scanUnit}
            bloodOnly={sellsBlood && !sellsScans}
            onAdd={addScan}
            onEdit={editScanRow}
            onPoster={openCentrePoster}
            onBar={setScanBar}
          />
        )}

        {activeTab === 'doctors' && !isCentre && (
          <View style={{ padding: 16 }}>

            <TouchableOpacity style={styles.addDoctorBtn} onPress={openAdd}>
              <Text style={styles.addDoctorBtnText}>+ Add New Doctor</Text>
            </TouchableOpacity>

            {loading ? (
              <ActivityIndicator color={Colors.blue600} style={{ marginTop: 40 }} />
            ) : doctors.length === 0 ? (
              <View style={styles.emptyDoctors}>
                <Ionicons name="medkit-outline" size={40} color={Colors.blue200} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyDoctorsTitle}>No Doctors Added Yet</Text>
                <Text style={styles.emptyDoctorsSub}>Tap "+ Add New Doctor" to get started</Text>
              </View>
            ) : (
              doctors.map((doc: Doctor) => {
                const hasDoctorImg   = isValidImage(doc.image);
                const hasHospitalImg = isValidImage(doc.hospital_image);
                const delay          = draftFor(doc);
                const delayBusy      = settingDelay.has(String(doc.id));
                const delayActive    = (doc.running_delay_minutes ?? 0) > 0;

                return (
                  <View key={String(doc.id)} style={styles.doctorCard}>

                    {/* ── Hospital Banner ── */}
                    <View style={styles.doctorBanner}>
                      {hasHospitalImg ? (
                        <Image
                          source={{ uri: doc.hospital_image }}
                          style={styles.doctorBannerImg}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={180}
                        />
                      ) : (
                        <View style={styles.doctorBannerPlaceholder}>
                          <Ionicons name="business-outline" size={26} color={Colors.gray400} />
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
                        <Image
                          source={{ uri: doc.image }}
                          style={styles.doctorProfileImg}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={180}
                        />
                      ) : (
                        <View style={styles.doctorProfilePlaceholder}>
                          <Ionicons name="medkit-outline" size={28} color={Colors.blue400} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.doctorName}>{providerLabel(doc.name)}</Text>
                        <Text style={styles.doctorSpec}>{doc.specialization}</Text>
                        <Text style={styles.doctorMeta}>{doc.mobile || doc.landline || '—'}  ·  {doc.experience}y exp</Text>
                        <Text style={styles.doctorMeta}>₹{doc.fee}  ·  Max {doc.max_per_slot}/slot</Text>
                      </View>
                    </View>

                    {/* ── Days Preview ── */}
                    {doc.days && doc.days.length > 0 && (
                      <View style={styles.slotPreviewRow}>
                        <Text style={styles.slotPreviewLabel}>Days:</Text>
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
                        <Text style={styles.slotPreviewLabel}>{doc.slots.length} slots:</Text>
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

                    {(!doc.slots || doc.slots.length === 0) && (
                      <View style={styles.slotPreviewRow}>
                        <View style={[styles.slotPreviewChip, { backgroundColor: Colors.blue50, borderColor: Colors.blue100 }]}>
                          <Text style={[styles.slotPreviewText, { color: Colors.blue800 }]}>
                            Walk-in — no online booking
                          </Text>
                        </View>
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
                            {doc.available ? 'Available' : 'Unavailable'}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => setPoster({
                          kind: 'doctor', id: doc.id, name: doc.name,
                          specialization: doc.specialization, hospital: hospital?.name, city: hospital?.city,
                        })}
                        accessibilityRole="button"
                        accessibilityLabel={`Poster for ${doc.name}`}
                      >
                        <Ionicons name="qr-code-outline" size={14} color={Colors.blue700} />
                        <Text style={styles.editBtnText}>Poster</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(doc)}>
                        <Ionicons name="create-outline" size={14} color={Colors.blue700} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDoctor(doc)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.errorText} />
                      </TouchableOpacity>
                    </View>

                    {/* ── Running Late ── */}
                    <View style={styles.delayRow}>
                      <Text style={styles.delayLabel}>
                        Running Late{delayActive ? ` · ${formatDelay(doc.running_delay_minutes ?? 0)}` : ''}
                      </Text>
                      <View style={styles.delayStepRow}>
                        <TouchableOpacity
                          style={[styles.delayStepBtn, delayBusy && { opacity: 0.5 }]}
                          onPress={() => patchDraft(doc, c => ({ minutes: clampDelay(c.minutes - DELAY_STEP) }))}
                          disabled={delayBusy}
                          accessibilityLabel="Less delay"
                        >
                          <Ionicons name="remove" size={18} color={Colors.gray700} />
                        </TouchableOpacity>
                        <Text style={styles.delayReadout} testID="delay-readout" accessibilityLabel={`Delay ${formatDelay(delay.minutes)}`}>
                          {formatDelay(delay.minutes)}
                        </Text>
                        <TouchableOpacity
                          style={[styles.delayStepBtn, delayBusy && { opacity: 0.5 }]}
                          onPress={() => patchDraft(doc, c => ({ minutes: clampDelay(c.minutes + DELAY_STEP) }))}
                          disabled={delayBusy}
                          accessibilityLabel="More delay"
                        >
                          <Ionicons name="add" size={18} color={Colors.gray700} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.delayBtnRow}>
                        {DELAY_QUICK.map(m => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.delayBtn, delay.minutes === m ? styles.delayBtnOn : styles.delayBtnOff, delayBusy && { opacity: 0.5 }]}
                            onPress={() => patchDraft(doc, () => ({ minutes: m }))}
                            disabled={delayBusy}
                            accessibilityLabel={`Set delay to ${formatDelay(m)}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: delay.minutes === m, disabled: delayBusy }}
                          >
                            <Text style={styles.delayBtnText}>{formatDelay(m)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={[styles.delayBtnRow, { marginTop: 6 }]}>
                        {DELAY_REASONS.map(([key, text]) => (
                          <TouchableOpacity
                            key={key}
                            style={[styles.delayBtn, delay.reason === key ? styles.delayBtnOn : styles.delayBtnOff, delayBusy && { opacity: 0.5 }]}
                            // Tap the chosen reason again to drop it: "no reason" is a state, not a button.
                            onPress={() => patchDraft(doc, c => ({ reason: c.reason === key ? '' : key }))}
                            disabled={delayBusy}
                            accessibilityLabel={`Reason: ${text}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: delay.reason === key, disabled: delayBusy }}
                          >
                            <Text style={styles.delayBtnText}>{text}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={[styles.delayBtnRow, { marginTop: 8 }]}>
                        <TouchableOpacity
                          style={[styles.delayNotifyBtn, delayBusy && { opacity: 0.5 }]}
                          onPress={() => setDoctorDelay(doc, delay.minutes, delay.reason)}
                          disabled={delayBusy}
                          accessibilityLabel={delayActive ? 'Update patients' : 'Notify patients'}
                        >
                          {delayBusy
                            ? <ActivityIndicator size="small" color={Colors.gray700} />
                            : <Text style={styles.delayNotifyText}>{delayActive ? 'Update patients' : 'Notify patients'}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.delayBtn, styles.delayBtnOff, (delayBusy || !delayActive) && { opacity: 0.5 }]}
                          onPress={() => markDoctorArrived(doc)}
                          disabled={delayBusy || !delayActive}
                          accessibilityLabel="Doctor arrived"
                        >
                          <Text style={styles.delayBtnText}>Arrived</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.delayBtn, styles.delayBtnOff, (delayBusy || !delayActive) && { opacity: 0.5 }]}
                          onPress={() => setDoctorDelay(doc, 0)}
                          disabled={delayBusy || !delayActive}
                          accessibilityLabel="Clear delay"
                        >
                          <Text style={styles.delayBtnText}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* ── On leave ── */}
                    <View style={styles.leaveRow}>
                      <TouchableOpacity style={styles.leaveBtn} onPress={() => openLeave(doc)} accessibilityLabel={`On leave ${doc.id}`}>
                        <Text style={styles.delayBtnText}>On leave…</Text>
                      </TouchableOpacity>
                      {(doc.leave_dates || []).map(l => (
                        <View key={l.date} style={styles.leaveChip}>
                          <Text style={styles.delayBtnText}>{`${l.date}${l.reason ? ` · ${l.reason}` : ''}`}</Text>
                          <TouchableOpacity onPress={() => removeLeave(doc, l.date)} accessibilityLabel={`Reopen ${l.date}`} accessibilityRole="button">
                            <Text style={styles.leaveX}>×</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>

                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {scanBar}
      {/* Outside the ScrollView so it floats over the screen, not the end of the list. */}
      {pickToast ? (
        <View style={[styles.pickToast, pickToast.isError && { backgroundColor: Colors.errorText }]}
              accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Text style={styles.pickToastText}>{pickToast.msg}</Text>
          {pickToast.canChange ? (
            <TouchableOpacity style={styles.pickToastBtn} onPress={() => setChanging(true)}
                              accessibilityRole="button" accessibilityLabel="Change who handled it">
              <Text style={styles.pickToastBtnText}>Change</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <Text style={styles.fieldError}>{msg}</Text> : null;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pickToast:            { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.successText, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  pickToastBtn:         { backgroundColor: Colors.white, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  pickToastBtnText:     { color: Colors.successText, fontSize: 13, fontWeight: '700' },
  pickToastText:        { color: Colors.white, fontSize: 14, fontWeight: '600' },
  safe: { flex: 1, backgroundColor: Colors.white },

  navbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  navLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  navRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, alignItems: 'center', justifyContent: 'center' },
  profileBtnText: { fontSize: 16 },
  navTitle:  { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  liveRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.successText },
  liveText:  { fontSize: 11, color: Colors.gray400 },
  logoutBtn: { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { fontSize: 13, fontWeight: '700', color: Colors.errorText },

  tabRow:        { flexDirection: 'row', marginTop: 12, marginHorizontal: 16, backgroundColor: Colors.blue50, borderRadius: 12, padding: 4, gap: 4 },
  tab:           { flex: 1, flexDirection: 'row', gap: 4, paddingVertical: 10, paddingHorizontal: 2, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabActive:     { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, elevation: 1 },
  tabText:       { fontSize: 12, fontWeight: '500', color: Colors.gray400, flexShrink: 1 },
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
  queueFold:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 10 },
  emptyMsg:     { fontSize: 13, color: Colors.gray400, textAlign: 'center', padding: 20, fontStyle: 'italic' },
  patientCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 14, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 12 },
  patientName:  { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 3 },
  patientMeta:  { fontSize: 12, color: Colors.gray500, marginBottom: 2 },
  patientPhone: { fontSize: 12, color: Colors.blue700, fontWeight: '600', marginBottom: 2 },

  sheetBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: Colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 28, gap: 4 },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  sheetSub:       { fontSize: 12.5, color: Colors.gray500, marginBottom: 10 },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: Colors.blue50 },
  sheetRowText:   { fontSize: 14.5, color: Colors.gray900, fontWeight: '600' },
  sheetCancel:    { marginTop: 12, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.gray50 },
  sheetCancelText:{ fontSize: 14, fontWeight: '700', color: Colors.gray700 },
  tokenChip:    { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6 },
  tokenChipText:{ fontSize: 12, fontWeight: '800', color: Colors.blue700, letterSpacing: 0.3 },
  patientActions:   { gap: 6, alignItems: 'stretch' },
  callBtn:      { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center' },
  callBtnText:  { color: Colors.white, fontWeight: '700', fontSize: 13 },
  btnHint:      { fontSize: 10, opacity: 0.75, marginTop: 2, textAlign: 'center' as const },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  segBtn: {
    flexGrow: 1, minWidth: 96,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 999,
    paddingVertical: 8, paddingHorizontal: 10, backgroundColor: Colors.white,
  },
  segBtnOn:   { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  segText:    { fontSize: 12, fontWeight: '700', color: Colors.gray500 },
  segTextOn:  { color: Colors.blue700 },
  scanShortcutBtn:  { flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  scanShortcutText: { color: Colors.blue700, fontWeight: '700', fontSize: 12 },
  holdBtn:      { flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  holdBtnText:  { color: Colors.warningText, fontWeight: '700', fontSize: 12 },
  resumeBtn:    { flexDirection: 'row', gap: 6, backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  resumeBtnText:{ color: Colors.white, fontWeight: '700', fontSize: 13 },
  doneBtn:      { backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  doneBtnText:  { color: Colors.successText, fontWeight: '700', fontSize: 13 },
  completedBadge: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: Colors.successBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  completedText:  { fontSize: 12, fontWeight: '600', color: Colors.successText },

  uploadBtn:      { flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, minWidth: 82, justifyContent: 'center' },
  uploadBtnText:  { fontSize: 12, fontWeight: '700', color: Colors.blue700 },

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
  editBtn:       { flex: 1.2, flexDirection: 'row', gap: 5, justifyContent: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  editBtnText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  deleteBtn:     { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  deleteBtnText: { fontSize: 14 },

  delayRow:      { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 12 },
  delayLabel:    { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginBottom: 6 },
  delayBtnRow:   { flexDirection: 'row', gap: 6 },
  delayBtn:      { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  delayBtnOn:    { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder },
  delayBtnOff:   { backgroundColor: Colors.gray100, borderColor: Colors.gray200 },
  delayBtnText:  { fontSize: 11, fontWeight: '700', color: Colors.gray700 },
  delayStepRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  delayStepBtn:  { width: 40, height: 36, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  delayReadout:  { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: Colors.gray700 },
  delayNotifyBtn:  { flex: 1.8, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg, alignItems: 'center', justifyContent: 'center' },
  leaveRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  leaveBtn:      { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg },
  leaveChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg },
  leaveX:        { fontSize: 16, lineHeight: 16, fontWeight: '800', color: Colors.warningText },
  leaveDay:      { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.gray100 },
  leaveInput:    { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: Colors.gray900 },
  leaveCount:    { fontSize: 11, color: Colors.gray500, alignSelf: 'flex-end', marginTop: 2, marginBottom: 6 },
  delayNotifyText: { fontSize: 12, fontWeight: '800', color: Colors.warningText },

  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.bg },
  modalCancel:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  modalCancelText: { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  modalTitle:      { fontSize: 14, fontWeight: '800', color: Colors.gray900, flex: 1, textAlign: 'center', marginHorizontal: 6 },
  modalSave:       { backgroundColor: Colors.blue600, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 8, minWidth: 58, alignItems: 'center' },
  modalSaveText:   { color: Colors.white, fontWeight: '700', fontSize: 14 },

  modalBody:    { padding: 20 },
  formSection:  { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.blue600, marginTop: 20, marginBottom: 14, textTransform: 'uppercase' },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  fieldHint:    { fontSize: 11.5, color: Colors.gray400, lineHeight: 17, marginTop: -4, marginBottom: 12 },
  fieldInput:   { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900, marginBottom: 14 },
  fieldRow:     { flexDirection: 'row' },
  // An errored input keeps its own margin; the message sits in the gap below it.
  fieldInputError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg, marginBottom: 4 },
  fieldError:      { fontSize: 11.5, color: Colors.errorText, marginBottom: 12 },

  suggestRow:      { gap: 6, paddingBottom: 14, paddingRight: 4 },
  suggestChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  suggestChipText: { fontSize: 12, fontWeight: '600', color: Colors.blue700 },
  switchRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, padding: 14, marginBottom: 14 },

  imageRow:             { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 6 },
  doctorImgPreview:     { width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue200, flexShrink: 0 },
  doctorImgPlaceholder: { width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  imagePickerCol:       { flex: 1, gap: 7 },
  pickImageBtn:         { flexDirection: 'row', gap: 8, justifyContent: 'center', backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  pickImageBtnText:     { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  removeImageBtn:       { flexDirection: 'row', gap: 6, justifyContent: 'center', backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  removeImageBtnText:   { fontSize: 12, fontWeight: '700', color: Colors.errorText },
  imageHint:            { fontSize: 11, color: Colors.gray400 },

  hospitalBannerPreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  hospitalBannerPreview:     { width: '100%', height: 110, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue200 },
  bannerRemoveBtn:           { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(163,45,45,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  bannerRemoveBtnText:       { fontSize: 12, fontWeight: '700', color: '#fff' },
  hospitalBannerPlaceholder: { width: '100%', height: 90, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  slotWarning:      { backgroundColor: Colors.errorBg, borderRadius: 10, padding: 10, marginBottom: 12 },
  walkInNote:       { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 10, padding: 12, marginBottom: 12 },
});