/**
 * components/ScanImport.tsx — import a centre's price list from a CSV. The app
 * mirror of the website's src/hospital/ScanImport.js.
 *
 * Read the file on the server (nothing saved), show every row, let the centre
 * untick or fix rows, then add the ticked ones. See utils/scanImport.ts.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import API from '../services/api';
import { flattenErrors, importSummary, templateCsv, toNum } from '../utils/scanImport';
import type { Unit } from '../utils/scanBulk';

interface Row {
  key: number;                       // the line in the file
  status: 'new' | 'exists' | 'invalid';
  errors: string[];
  name: string; modality: string; price: string; duration_minutes: string; prep_instructions: string;
  checked: boolean;
}

interface Props {
  centerId: number | string;
  unit: Unit;
  onDone: (summary: string) => void;
  onClose: () => void;
}

export default function ScanImport({ centerId, unit, onDone, onClose }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);   // null until a file has been read
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rowErrs, setRowErrs] = useState<Record<number, string[]>>({});   // file line -> server messages
  const savingRef = useRef(false);   // state lags a fast double-tap; this does not

  const many = `${unit}s`;
  // While the next file is being read the old preview is about to be replaced:
  // it must not be editable, and Add must not post rows that are going away.
  const showPreview = !!rows && !reading;
  const ticked = (rows || []).filter(r => r.status === 'new' && r.checked);
  const count = (st: Row['status']) => (rows || []).filter(r => r.status === st).length;
  const edit = (key: number, patch: Partial<Row>) =>
    setRows(rs => (rs || []).map(r => (r.key === key ? { ...r, ...patch } : r)));

  const shareTemplate = async () => {
    try {
      // Required when needed, not imported up top: native modules the dashboard
      // should not load on every mount.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const f = new FileSystem.File(FileSystem.Paths.cache, 'tokenwalla-tests-template.csv');
      if (f.exists) f.delete();
      f.create();
      f.write(templateCsv(unit));
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
      await Sharing.shareAsync(f.uri, {
        mimeType: 'text/csv', dialogTitle: 'Price list template', UTI: 'public.comma-separated-values-text',
      });
    } catch {
      Alert.alert('Error', 'Could not share the template on this device.');
    }
  };

  const pick = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
    // '*/*', not 'text/csv': Android reports a CSV as text/csv, as
    // application/vnd.ms-excel or as text/comma-separated-values depending on the
    // app that saved it. The server checks the .csv name and says so if it is not.
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setError(''); setRowErrs({}); setReading(true);
    const fd = new FormData();
    fd.append('center', String(centerId));
    // The real File on web, the { uri, name, type } shape on native (sending the
    // native shape on web posts a blob: URL as text and the server sees no file).
    const file = (a as { file?: File }).file;
    if (file) fd.append('file', file, a.name);
    else fd.append('file', { uri: a.uri, name: a.name || 'prices.csv', type: a.mimeType || 'text/csv' } as unknown as Blob);
    try {
      const { data } = await API.post('/scans/import-preview/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setRows((data.rows || []).map((r: any): Row => ({
        key: r.row,
        status: r.status,
        errors: r.errors || [],
        name: r.name || '',
        modality: r.modality || '',
        price: r.price == null ? '' : String(r.price),
        duration_minutes: r.duration_minutes == null ? '' : String(r.duration_minutes),
        prep_instructions: r.prep_instructions || '',
        checked: r.status === 'new',
      })));
    } catch (err: any) {
      // Any earlier preview stays, so a bad second file loses nothing.
      setError(err?.response?.data?.message || 'Could not read that file. Please try again.');
    } finally {
      setReading(false);
    }
  };

  const add = async () => {
    if (savingRef.current || ticked.length === 0) return;
    savingRef.current = true;
    setSaving(true); setError(''); setRowErrs({});
    try {
      const { data } = await API.post('/scans/import/', {
        center: centerId,
        rows: ticked.map(r => ({
          name: r.name.trim(),
          modality: r.modality.trim(),
          price: toNum(r.price),
          duration_minutes: toNum(r.duration_minutes) ?? 15,
          prep_instructions: r.prep_instructions.trim(),
        })),
      });
      onDone(importSummary({ created: data.created, skipped: (data.skipped || []).length }, unit));
    } catch (err: any) {
      const data = err?.response?.data;
      setError(data?.message || 'Could not add them. Please try again.');
      // The server's index is into the rows we sent (the ticked ones), not the whole preview.
      if (Array.isArray(data?.errors)) {
        const byRow: Record<number, string[]> = {};
        data.errors.forEach((x: any) => { if (ticked[x.index]) byRow[ticked[x.index].key] = flattenErrors(x.errors); });
        setRowErrs(byRow);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const field = (r: Row, key: 'name' | 'modality' | 'price' | 'duration_minutes' | 'prep_instructions',
    label: string, numeric = false) => (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, key === 'prep_instructions' && { minHeight: 44 }]}
        value={r[key]} onChangeText={v => edit(r.key, { [key]: numeric ? v.replace(/\D/g, '') : v })}
        keyboardType={numeric ? 'number-pad' : 'default'} multiline={key === 'prep_instructions'}
        accessibilityLabel={`${label} for row ${r.key}`} placeholderTextColor={Colors.gray400}
      />
    </View>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={['top']}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.cancel} accessibilityRole="button">
              <Ionicons name="close" size={15} color={Colors.errorText} />
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.title} numberOfLines={1}>Import {many} from a file</Text>
            <View style={{ minWidth: 68 }} />
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.step}>
              1. Get the template, fill it in Excel or Google Sheets, delete the two example rows and
              save it as CSV.
            </Text>
            <TouchableOpacity style={s.action} onPress={shareTemplate} accessibilityRole="button">
              <Ionicons name="download-outline" size={16} color={Colors.blue700} />
              <Text style={s.actionText}>Get template</Text>
            </TouchableOpacity>
            <Text style={s.step}>2. Choose your CSV file. You will see every row before anything is added.</Text>
            <TouchableOpacity style={[s.action, (reading || saving) && { opacity: 0.5 }]}
              onPress={pick} disabled={reading || saving} accessibilityRole="button">
              <Ionicons name="document-outline" size={16} color={Colors.blue700} />
              <Text style={s.actionText}>Choose CSV file</Text>
            </TouchableOpacity>
            <Text style={s.hint}>
              Imported {many} have no time slots yet (walk-in). You can add slots to each one afterwards.
            </Text>

            {reading && <Text style={s.hint}>Reading your file…</Text>}
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.errorText} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {showPreview && (
              <>
                <Text style={s.counts}>
                  {count('new')} new, {count('exists')} already listed, {count('invalid')} with problems
                </Text>
                {count('invalid') > 0 && (
                  <Text style={s.warn}>Rows with problems are not added. Fix them in your file and upload it again.</Text>
                )}
                {(rows || []).map(r => {
                  const live = r.status === 'new';
                  const errs = (live ? rowErrs[r.key] : r.errors) || [];
                  return (
                    <View key={r.key} style={[s.card, r.status === 'exists' && s.cardMuted,
                      r.status === 'invalid' && s.cardBad, live && r.checked && s.cardOn]}>
                      <View style={s.cardHead}>
                        {live ? (
                          <TouchableOpacity style={s.tick} onPress={() => edit(r.key, { checked: !r.checked })}
                            accessibilityRole="checkbox" accessibilityState={{ checked: r.checked }}
                            accessibilityLabel={`Add row ${r.key}`}>
                            <Ionicons name={r.checked ? 'checkbox' : 'square-outline'} size={22}
                              color={r.checked ? Colors.blue600 : Colors.gray400} />
                          </TouchableOpacity>
                        ) : null}
                        <Text style={s.rowNo}>Row {r.key}</Text>
                        {live && errs.length === 0 && <Text style={s.hint}>{r.checked ? 'Will be added' : 'Left out'}</Text>}
                        {r.status === 'exists' && <Text style={s.hint}>Already listed - skipped</Text>}
                      </View>
                      {live ? (
                        <>
                          {field(r, 'name', 'Name')}
                          {field(r, 'modality', 'Type')}
                          {field(r, 'price', 'Price (Rs)', true)}
                          {field(r, 'duration_minutes', 'Minutes', true)}
                          {field(r, 'prep_instructions', 'Before you come')}
                        </>
                      ) : (
                        <Text style={s.plain}>
                          {[r.name, r.modality, r.price && `₹${r.price}`].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {errs.map(m => <Text key={m} style={s.rowErr}>{m}</Text>)}
                    </View>
                  );
                })}
              </>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>

          {showPreview && (
            <View style={s.footer}>
              <TouchableOpacity style={[s.add, (ticked.length === 0 || saving) && { opacity: 0.45 }]}
                disabled={ticked.length === 0 || saving} onPress={add} accessibilityRole="button"
                accessibilityLabel={`Add ${ticked.length} ${ticked.length === 1 ? unit : many}`}>
                {saving ? <ActivityIndicator color={Colors.white} size="small" />
                        : <Text style={s.addText}>Add {ticked.length} {ticked.length === 1 ? unit : many}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  cancel:     { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 68 },
  cancelText: { color: Colors.errorText, fontWeight: '700', fontSize: 13 },
  title:      { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.gray900 },

  body: { padding: 16 },
  step: { fontSize: 13, color: Colors.gray700, lineHeight: 19, marginBottom: 8 },
  hint: { fontSize: 12, color: Colors.gray500, lineHeight: 17, marginBottom: 8 },
  action: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.blue200, backgroundColor: Colors.blue50, borderRadius: 10, paddingVertical: 11, marginBottom: 14 },
  actionText: { fontSize: 13.5, fontWeight: '700', color: Colors.blue700 },

  errorBox:  { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, color: Colors.errorText, fontSize: 13, lineHeight: 18 },

  counts: { fontSize: 13.5, fontWeight: '700', color: Colors.gray800, marginTop: 6, marginBottom: 8 },
  warn:   { fontSize: 12.5, color: Colors.warningText, backgroundColor: Colors.warningBg, borderRadius: 10, padding: 10, marginBottom: 10, lineHeight: 18 },

  card:      { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardOn:    { borderColor: Colors.blue600 },
  cardMuted: { backgroundColor: Colors.gray50 },
  cardBad:   { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tick:      { minWidth: 28, minHeight: 28, justifyContent: 'center' },
  rowNo:     { fontSize: 13, fontWeight: '800', color: Colors.gray800 },
  plain:     { fontSize: 13, color: Colors.gray600, lineHeight: 18 },
  rowErr:    { fontSize: 12.5, color: Colors.errorText, marginTop: 4, lineHeight: 17 },

  fieldRow:   { marginBottom: 8 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.gray500, marginBottom: 3 },
  input: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, fontSize: 14, color: Colors.gray900, backgroundColor: Colors.white },

  footer:  { padding: 12, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  add:     { backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  addText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
