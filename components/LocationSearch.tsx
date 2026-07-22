/**
 * components/LocationSearch.tsx — React Native place autocomplete.
 *
 * Free OpenStreetMap (Photon) search — no API key. As the user types it
 * suggests real places and, on pick, returns the place's city + coordinates
 * so we can store an accurate map location.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';

export interface PickedPlace {
  city:  string;
  label: string;
  lat:   number | null;
  lng:   number | null;
}

interface Props {
  value:        string;
  onChangeText: (t: string) => void;
  onPick:       (p: PickedPlace) => void;
  placeholder?: string;
  hasError?:    boolean;
}

export default function LocationSearch({
  value, onChangeText, onPick,
  placeholder = 'Search your city or area…',
  hasError = false,
}: Props) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuery   = useRef('');

  // Debounced Photon lookup, biased toward Andhra Pradesh / Telangana.
  useEffect(() => {
    const q = (value || '').trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        lastQuery.current = q;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=16.5&lon=79.5`;
        const res  = await fetch(url);
        const data = await res.json();
        if (lastQuery.current !== q) return; // a newer query is in flight
        setResults(Array.isArray(data.features) ? data.features : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  const labelFor = (f: any): string => {
    const p = f.properties || {};
    return [p.name, p.city && p.city !== p.name ? p.city : null, p.state]
      .filter(Boolean).join(', ');
  };

  const pick = (f: any) => {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates || [];
    const city = p.city
      || ((p.osm_value === 'city' || p.osm_value === 'town') ? p.name : '')
      || p.county || p.name || '';
    onPick({
      city,
      label: labelFor(f),
      lat: typeof coords[1] === 'number' ? coords[1] : null,
      lng: typeof coords[0] === 'number' ? coords[0] : null,
    });
    setResults([]);
    setOpen(false);
  };

  return (
    <View>
      <View style={[styles.inputRow, hasError && styles.inputRowError]}>
        <Text style={styles.icon}>📍</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray400}
          value={value}
          onChangeText={(t) => { onChangeText(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={Colors.blue600} />}
      </View>

      {open && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((f, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.item, i > 0 && styles.itemBorder]}
              onPress={() => pick(f)}
            >
              <Text style={styles.itemText}>📍 {labelFor(f)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, gap: 10 },
  inputRowError: { borderColor: Colors.errorBorder, backgroundColor: Colors.errorBg },
  icon:          { fontSize: 15 },
  input:         { flex: 1, fontSize: 15, color: Colors.gray900, paddingVertical: 13 },
  dropdown:      { marginTop: 6, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, overflow: 'hidden' },
  item:          { paddingVertical: 12, paddingHorizontal: 14 },
  itemBorder:    { borderTopWidth: 1, borderTopColor: Colors.blue50 },
  itemText:      { fontSize: 14, color: Colors.gray800 },
});
