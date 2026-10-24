/**
 * components/ScansPanel.tsx — a centre's "Your tests" list on the hospital
 * dashboard: the search box, Select mode (bulk edit and delete), import, and the
 * cards with Edit / Delete.
 *
 * It owns all of that state, so the dashboard (which re-renders every 10 s for the
 * queue poll) does not. The panel is memoised on stable props, so a poll tick
 * does not re-render the list either. It is mounted only while the tests tab is
 * open, which is also what ends Select mode when the user leaves the tab.
 *
 * The Select bar has to sit under the page's ScrollView, outside this component's
 * place in it, so it is handed up through `onBar` and drawn by the dashboard.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  memo, type ReactNode, useEffect, useLayoutEffect, useState,
} from 'react';
import {
  ActivityIndicator, BackHandler, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { Colors } from '../constants/colors';
import { matchesTest, SEARCH_ABOVE } from '../utils/matchTest';
import { bulkDeleteSummary, postInBatches, type Unit } from '../utils/scanBulk';
import { SCAN_PAGE } from '../utils/scanCenters';
import ScanBulkEdit from './ScanBulkEdit';
import { confirmDeleteScan, type ScanRecord } from './ScanEditorModal';
import ScanImport from './ScanImport';

interface Props {
  scans: ScanRecord[];
  loadScans: () => Promise<void>;
  /** Undefined until the hospital has loaded; Import needs it. */
  centerId: number | string | undefined;
  unit: Unit;
  /** A blood-only lab gets the drop icon on an empty list, anyone else the pulse. */
  bloodOnly: boolean;
  onAdd: () => void;
  onEdit: (scan: ScanRecord) => void;
  /** Receives the pinned Select bar (or null), from a layout effect so it lands before
   *  paint. MUST be a stable function (a state setter): the panel is memoised on its
   *  props, and an unstable one would re-render it after every bar update, forever. */
  onBar: (bar: ReactNode) => void;
}

type Id = number | string;

function ScansPanel({ scans, loadScans, centerId, unit, bloodOnly, onAdd, onEdit, onBar }: Props) {
  const Noun = `${unit[0].toUpperCase()}${unit.slice(1)}`;
  const many = `${unit}s`;

  const [query,        setQuery]        = useState('');
  const [shown,        setShown]        = useState(SCAN_PAGE);
  // Select mode: ticked ids, and which bulk step is open.
  const [selecting,    setSelecting]    = useState(false);
  const [picked,       setPicked]       = useState<Id[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [confirmIds,   setConfirmIds]   = useState<Id[] | null>(null);   // ids the delete prompt was opened for
  const [bulkBusy,     setBulkBusy]     = useState(false);
  const [importOpen,   setImportOpen]   = useState(false);
  const [notice,       setNotice]       = useState<{ text: string; error: boolean } | null>(null);

  // The box only exists past SEARCH_ABOVE tests; a query typed before the list
  // shrank (a bulk delete) must not keep filtering with nothing to clear it.
  const matched = scans.filter(sc => matchesTest(sc, scans.length > SEARCH_ABOVE ? query : ''));
  // Sets, not includes(): 800 selected tests would be ~640k comparisons per render.
  const pickedSet = new Set(picked);
  const confirmSet = new Set(confirmIds || []);
  // Only what the search is showing is acted on: a test ticked and then filtered
  // out is not edited or deleted behind the user's back.
  const pickedScans = matched.filter(sc => pickedSet.has(sc.id));
  const allPicked = matched.length > 0 && pickedScans.length === matched.length;

  const togglePick = (id: Id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const toggleAllPicked = () => setPicked(p => {
    const inView = new Set(matched.map(sc => sc.id));
    return allPicked ? p.filter(id => !inView.has(id)) : [...new Set([...p, ...inView])];
  });
  const endSelecting = () => {
    setSelecting(false); setPicked([]); setBulkEditOpen(false); setConfirmIds(null);
  };

  // Android back steps out one level at a time, as Esc does on the website: the
  // delete prompt, then select mode. Only while selecting, so back keeps its
  // normal meaning on the rest of the dashboard.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmIds) setConfirmIds(null);
      else { setSelecting(false); setPicked([]); setBulkEditOpen(false); }
      return true;
    });
    return () => sub.remove();
  }, [selecting, confirmIds]);

  const onBulkEdited = async (text: string, failure?: boolean) => {
    await loadScans();
    endSelecting();
    setNotice({ text, error: !!failure });
  };

  const bulkDelete = async () => {
    if (!confirmIds) return;
    setBulkBusy(true);
    try {
      // The ids the prompt named, not whatever is ticked by now.
      const done = await postInBatches('/scans/bulk-delete/', 'ids', confirmIds);
      await loadScans();
      endSelecting();
      setNotice({ text: bulkDeleteSummary(done, unit), error: false });
    } catch (err: any) {
      const msg = err?.response?.data?.message || `Could not delete the ${many}.`;
      if (err?.doneCount) {
        // Some are already gone: reload and leave select mode rather than offer
        // the same ids again.
        await loadScans();
        endSelecting();
        setNotice({ text: `${msg} Only the first ${err.doneCount} of ${confirmIds.length} were deleted or hidden.`, error: true });
      } else {
        setConfirmIds(null);
        setNotice({ text: msg, error: true });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  // Select mode's actions, pinned under the list so they stay in reach however
  // far down a long price list the user has scrolled.
  const bar = selecting ? (
    <View style={s.selectBar}>
      {confirmIds ? (
        <>
          <Text style={s.selectBarTitle}>
            Delete {confirmIds.length} {confirmIds.length === 1 ? unit : many}?
          </Text>
          <Text style={s.selectBarSub} numberOfLines={2}>
            {scans.filter(sc => confirmSet.has(sc.id)).slice(0, 3).map(sc => sc.name).join(', ')}
            {confirmIds.length > 3 && ` and ${confirmIds.length - 3} more`}
          </Text>
          <Text style={s.selectBarSub}>
            This cannot be undone. Any with booking history are set to Hidden instead
            (patients can still see them but cannot book), so past bookings keep their record.
          </Text>
          <View style={s.selectBarRow}>
            <TouchableOpacity style={[s.selectDanger, bulkBusy && { opacity: 0.6 }]}
              disabled={bulkBusy} onPress={bulkDelete} accessibilityRole="button">
              {bulkBusy ? <ActivityIndicator color={Colors.white} size="small" />
                        : <Text style={s.selectDangerText}>Delete {confirmIds.length}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.selectGhost} disabled={bulkBusy}
              onPress={() => setConfirmIds(null)} accessibilityRole="button">
              <Text style={s.scanEditText}>Keep</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={s.selectBarRow}>
            <TouchableOpacity style={s.selectGhost} onPress={toggleAllPicked}
              disabled={matched.length === 0} accessibilityRole="button">
              <Text style={s.scanEditText}>
                {allPicked ? 'Clear selection' : `Select all (${matched.length})`}
              </Text>
            </TouchableOpacity>
            <Text style={s.selectCount} accessibilityLiveRegion="polite">
              {pickedScans.length} selected
            </Text>
          </View>
          <View style={s.selectBarRow}>
            <TouchableOpacity style={[s.selectPrimary, pickedScans.length === 0 && { opacity: 0.45 }]}
              disabled={pickedScans.length === 0} onPress={() => setBulkEditOpen(true)}
              accessibilityRole="button" accessibilityLabel="Edit selected">
              <Ionicons name="create-outline" size={15} color={Colors.white} />
              <Text style={s.selectPrimaryText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.selectOutlineDanger, pickedScans.length === 0 && { opacity: 0.45 }]}
              disabled={pickedScans.length === 0}
              onPress={() => { setBulkEditOpen(false); setConfirmIds(pickedScans.map(sc => sc.id)); }}
              accessibilityRole="button" accessibilityLabel="Delete selected">
              <Ionicons name="trash-outline" size={15} color={Colors.errorText} />
              <Text style={s.scanDeleteText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.selectGhost} onPress={endSelecting} accessibilityRole="button">
              <Text style={s.scanEditText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  ) : null;

  // Runs on every render of the panel, which is rare (its own state, or new
  // props). A layout effect, so the bar the dashboard draws is never a commit behind
  // the panel; the dashboard's setState bails out while the bar is still null.
  useLayoutEffect(() => { onBar(bar); });
  useEffect(() => () => onBar(null), [onBar]);

  return (
    <View style={{ padding: 16 }}>
      <Text style={s.scanLead}>
        Patients see these, with prices, on your centre page.
      </Text>

      {!selecting && (
        <TouchableOpacity style={s.addBtn} onPress={onAdd}>
          <Text style={s.addBtnText}>+ Add New {Noun}</Text>
        </TouchableOpacity>
      )}

      {!selecting && (
        <View style={s.scanTools}>
          <TouchableOpacity
            style={s.scanToolBtn}
            onPress={() => { setNotice(null); setImportOpen(true); }}
            accessibilityRole="button"
          >
            <Ionicons name="cloud-upload-outline" size={16} color={Colors.blue700} />
            <Text style={s.scanEditText}>Import from file</Text>
          </TouchableOpacity>
          {scans.length > 1 && (
            <TouchableOpacity
              style={s.scanToolBtn}
              onPress={() => { setNotice(null); setSelecting(true); }}
              accessibilityRole="button"
            >
              <Ionicons name="checkbox-outline" size={16} color={Colors.blue700} />
              <Text style={s.scanEditText}>Select</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!notice && (
        <TouchableOpacity
          style={[s.scanNotice, notice.error && s.scanNoticeErr]}
          onPress={() => setNotice(null)}
          accessibilityRole="alert"
        >
          <Text style={[s.scanNoticeText, notice.error && { color: Colors.errorText }]}>
            {notice.text}
          </Text>
        </TouchableOpacity>
      )}

      {scans.length > SEARCH_ABOVE && (
        <TextInput
          style={s.scanSearch}
          value={query}
          onChangeText={v => { setQuery(v); setShown(SCAN_PAGE); }}
          placeholder={`Search ${many} by name, type or words`}
          placeholderTextColor={Colors.gray400}
          accessibilityLabel={`Search your ${many}`}
          autoCorrect={false}
          returnKeyType="search"
        />
      )}
      {scans.length > 0 && matched.length === 0 && (
        <Text style={s.scanLead}>Nothing matches your search.</Text>
      )}

      {scans.length === 0 ? (
        <View style={s.scanEmpty}>
          <Ionicons name={bloodOnly ? 'water-outline' : 'pulse-outline'} size={38} color={Colors.gray400} />
          <Text style={s.scanEmptyTitle}>No {many} listed yet</Text>
          <Text style={s.scanEmptySub}>
            Patients can find your centre but cannot see what you offer
            until you add one.
          </Text>
        </View>
      ) : matched.slice(0, shown).map(sc => (
        <TouchableOpacity
          key={String(sc.id)}
          style={[s.scanCard, selecting && pickedSet.has(sc.id) && s.scanCardPicked]}
          activeOpacity={selecting ? 0.8 : 1}
          disabled={!selecting || !!confirmIds}
          onPress={() => togglePick(sc.id)}
          // Not accessible outside select mode: an accessible parent hides the
          // Edit and Delete buttons inside it from VoiceOver.
          accessible={selecting}
          accessibilityRole={selecting ? 'checkbox' : undefined}
          accessibilityState={selecting ? { checked: pickedSet.has(sc.id) } : undefined}
          accessibilityLabel={selecting ? `Select ${sc.name}` : undefined}
        >
          <View style={s.scanTop}>
            {selecting && (
              <Ionicons
                name={pickedSet.has(sc.id) ? 'checkbox' : 'square-outline'} size={22}
                color={pickedSet.has(sc.id) ? Colors.blue600 : Colors.gray400} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.scanName}>{sc.name}</Text>
              <Text style={s.scanMeta}>
                {[sc.modality, `${sc.duration_minutes} min`,
                  `${sc.slots?.length || 0} slot${sc.slots?.length === 1 ? '' : 's'}`]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.scanPrice}>₹{sc.price}</Text>
              <Text style={s.scanPayMode}>
                {sc.payment_collection_mode === 'FULL' ? 'Paid online' : 'Paid at centre'}
              </Text>
              <Text style={[s.scanBadge, !sc.available && s.scanBadgeOff]}>
                {sc.available ? 'Listed' : 'Hidden'}
              </Text>
            </View>
          </View>
          {!!sc.prep_instructions && (
            <Text style={s.scanPrep}>⚠ {sc.prep_instructions}</Text>
          )}
          {!selecting && (
            <View style={s.scanActions}>
              <TouchableOpacity style={s.scanEditBtn} onPress={() => onEdit(sc)}>
                <Ionicons name="create-outline" size={15} color={Colors.blue700} />
                <Text style={s.scanEditText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.scanDeleteBtn} onPress={() => confirmDeleteScan(sc, loadScans, unit)}>
                <Ionicons name="trash-outline" size={15} color={Colors.errorText} />
                <Text style={s.scanDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {matched.length > shown && (
        <TouchableOpacity
          style={s.scanMoreBtn}
          onPress={() => setShown(n => n + SCAN_PAGE)}
          accessibilityRole="button"
        >
          <Text style={s.scanEditText}>
            Show more ({matched.length - shown} left)
          </Text>
        </TouchableOpacity>
      )}

      {/* Mounted only while open, so their ticks and typed values start fresh. */}
      {importOpen && centerId !== undefined && (
        <ScanImport
          centerId={centerId}
          unit={unit}
          onDone={async (text: string) => {
            setImportOpen(false);
            await loadScans();
            setNotice({ text, error: false });
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
      {bulkEditOpen && pickedScans.length > 0 && (
        <ScanBulkEdit
          visible
          scans={pickedScans}
          unit={unit}
          onDone={onBulkEdited}
          onClose={() => setBulkEditOpen(false)}
        />
      )}
    </View>
  );
}

export default memo(ScansPanel);

const s = StyleSheet.create({
  scanLead:  { fontSize: 12.5, color: Colors.gray500, lineHeight: 18, marginBottom: 14 },
  scanEmpty: { alignItems: 'center', gap: 6, paddingVertical: 40 },
  scanEmptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray800 },
  scanEmptySub:   { fontSize: 12.5, color: Colors.gray500, textAlign: 'center', lineHeight: 18, paddingHorizontal: 24 },
  scanCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  scanTop:   { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  scanName:  { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  scanMeta:  { fontSize: 12.5, color: Colors.gray500, marginTop: 3 },
  scanPrice: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  scanBadge: {
    fontSize: 10.5, fontWeight: '700', color: Colors.successText,
    backgroundColor: Colors.successBg, paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: 6, overflow: 'hidden', marginTop: 4,
  },
  scanBadgeOff: { color: Colors.gray500, backgroundColor: Colors.gray100 },
  scanPayMode:  { fontSize: 11, color: Colors.gray500, marginTop: 3, fontWeight: '600' },
  scanPrep: { fontSize: 12, color: '#92400E', marginTop: 9, lineHeight: 17 },
  scanActions:    { flexDirection: 'row', gap: 10, marginTop: 12 },
  scanEditBtn:    { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingVertical: 9 },
  scanEditText:   { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  scanTools:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  scanToolBtn:    { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingVertical: 10 },
  scanSearch:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, color: Colors.gray900, marginBottom: 12 },
  scanNotice:     { backgroundColor: Colors.successBg, borderRadius: 10, padding: 12, marginBottom: 12 },
  scanNoticeErr:  { backgroundColor: Colors.errorBg },
  scanNoticeText: { fontSize: 13, lineHeight: 18, color: Colors.successText },
  scanCardPicked: { borderColor: Colors.blue600, backgroundColor: Colors.blue50 },
  selectBar:      { borderTopWidth: 1, borderTopColor: Colors.gray200, backgroundColor: Colors.white, padding: 12, gap: 8 },
  selectBarRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectBarTitle: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  selectBarSub:   { fontSize: 12, color: Colors.gray500, lineHeight: 17 },
  selectCount:    { flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: Colors.gray800 },
  selectGhost:    { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  selectPrimary:  { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.blue600, borderRadius: 10, paddingVertical: 10 },
  selectPrimaryText: { fontSize: 13.5, fontWeight: '700', color: Colors.white },
  selectOutlineDanger: { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg, borderRadius: 10, paddingVertical: 10 },
  selectDanger:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorText, borderRadius: 10, paddingVertical: 11 },
  selectDangerText: { fontSize: 13.5, fontWeight: '700', color: Colors.white },
  scanMoreBtn:    { alignItems: 'center', borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  scanDeleteBtn:  { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg, borderRadius: 10, paddingVertical: 9 },
  scanDeleteText: { fontSize: 13, fontWeight: '700', color: Colors.errorText },
  addBtn:      { backgroundColor: Colors.blue600, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginBottom: 16, shadowColor: Colors.blue600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  addBtnText:  { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
