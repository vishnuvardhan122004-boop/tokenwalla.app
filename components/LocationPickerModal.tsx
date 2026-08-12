/**
 * components/LocationPickerModal.tsx
 *
 * Map location picker for the hospital profile — Google-Maps-style: the pin is
 * fixed at the centre of the map and you drag the map underneath it.
 *
 * Deliberately built on what the app already ships rather than react-native-maps:
 * that is a native module, so it would force an EAS rebuild AND a Google Maps
 * API key for Android. Instead Leaflet runs inside the WebView we already use
 * for Razorpay checkout, over the same free key-less OpenStreetMap tiles and
 * Photon geocoding that `components/LocationSearch.tsx` uses, and "use my
 * location" goes through expo-location, already installed and already carrying
 * its permission strings in app.json. Net new native dependencies: none.
 *
 * ponytail: OSM's public tile server is fine at hospital-profile volume; move to
 * a paid tile host if this ever lands on a patient-facing screen.
 *
 * Mirrors the website's `src/componets/LocationPicker.js`.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Colors } from '../constants/colors';
import { mapHtml } from '../utils/mapHtml';
import {
  isUsableCoord,
  MIN_CONFIRM_ZOOM,
  placeFromFeature,
  type PlaceLabel,
} from '../utils/placeLabel';
import LocationSearch from './LocationSearch';

export interface PickedLocation {
  city:  string;
  label: string;
  lat:   number;
  lng:   number;
}

interface Props {
  visible: boolean;
  initial: { lat: number | null; lng: number | null } | null;
  onClose: () => void;
  onPick:  (p: PickedLocation) => void;
}

// Same AP/Telangana bias as LocationSearch, for a hospital with nothing saved.
const FALLBACK = { lat: 16.5, lng: 79.5, zoom: 6 };

export default function LocationPickerModal({ visible, initial, onClose, onPick }: Props) {
  const webRef  = useRef<WebView>(null);
  const revRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef  = useRef(0);

  const [center,   setCenter]   = useState<{ lat: number; lng: number } | null>(null);
  const [zoom,     setZoom]     = useState(0);
  const [place,    setPlace]    = useState<PlaceLabel | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [locating, setLocating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');

  const hasInitial = !!initial && isUsableCoord(initial.lat, initial.lng);
  const start = hasInitial
    ? { lat: initial!.lat as number, lng: initial!.lng as number, zoom: 16 }
    : FALLBACK;

  // Reset per-open so a second open does not inherit the last pin's address.
  useEffect(() => {
    if (!visible) return;
    setCenter(null); setZoom(0); setPlace(null);
    setError(''); setSearch(''); setLocating(false);
    return () => {
      if (revRef.current) clearTimeout(revRef.current);
      // Bumping the sequence on close is the point: it makes any reverse-geocode
      // still in flight discard its result instead of setting state after close.
      // The lint rule assumes a DOM-node ref, where reading .current late is a
      // bug; here the latest value is exactly what we want.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seqRef.current++;
    };
  }, [visible]);

  // Reverse-geocode the map centre, debounced — the label under the pin.
  const reverse = useCallback((lat: number, lng: number) => {
    if (revRef.current) clearTimeout(revRef.current);
    setLoading(true);
    const seq = ++seqRef.current;
    revRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`);
        const data = await res.json();
        if (seq !== seqRef.current) return;      // a newer move won
        setPlace(placeFromFeature(data.features?.[0]));
      } catch {
        if (seq === seqRef.current) setPlace(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 450);
  }, []);

  const flyTo = (lat: number, lng: number, z = 17) => {
    webRef.current?.injectJavaScript(`window.__fly && window.__fly(${lat}, ${lng}, ${z}); true;`);
  };

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }

    if (msg.type === 'movestart') { setDragging(true); return; }
    if (msg.type === 'error') { setError('The map could not load. Check your connection.'); return; }
    if (msg.type !== 'move') return;
    if (!isUsableCoord(msg.lat, msg.lng)) return;

    setDragging(false);
    setCenter({ lat: msg.lat, lng: msg.lng });
    setZoom(typeof msg.zoom === 'number' ? msg.zoom : 0);
    reverse(msg.lat, msg.lng);
  };

  const useMyLocation = async () => {
    setError('');
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission was blocked. Search, or drag the pin instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      flyTo(pos.coords.latitude, pos.coords.longitude, 17);
    } catch {
      setError('Could not get your location. Search, or drag the pin instead.');
    } finally {
      setLocating(false);
    }
  };

  const tooFar = zoom < MIN_CONFIRM_ZOOM;

  const confirm = () => {
    if (!center || tooFar) return;
    onPick({ city: place?.city || '', label: place?.label || '', lat: center.lat, lng: center.lng });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={st.safe} edges={['top']}>

        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>Set hospital location</Text>
            <Text style={st.sub}>Drag the map so the pin sits on your entrance</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={st.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={Colors.gray600} />
          </TouchableOpacity>
        </View>

        {/* Search sits above the map, not over it — an absolute dropdown above a
            native WebView is unreliable on Android. */}
        <View style={st.searchWrap}>
          <LocationSearch
            value={search}
            placeholder="Search area, landmark or pincode…"
            onChangeText={setSearch}
            onPick={({ label, lat, lng }) => {
              setSearch(label);
              if (isUsableCoord(lat, lng)) flyTo(lat as number, lng as number);
            }}
          />
        </View>

        <View style={st.mapWrap}>
          <WebView
            ref={webRef}
            source={{ html: mapHtml(start.lat, start.lng, start.zoom) }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            originWhitelist={['*']}
            mixedContentMode="always"
            renderLoading={() => (
              <View style={st.centreLoader}>
                <ActivityIndicator size="large" color={Colors.blue600} />
                <Text style={st.loadingText}>Loading map…</Text>
              </View>
            )}
          />

          {/* Centre pin — never intercepts drags */}
          <View style={st.pinWrap} pointerEvents="none">
            <Ionicons
              name="location-sharp"
              size={38}
              color={Colors.blue600}
              style={{ marginBottom: dragging ? 10 : 0 }}
            />
            <View style={[st.pinShadow, { opacity: dragging ? 0.25 : 0.45 }]} />
          </View>

          <TouchableOpacity
            style={st.locateBtn}
            onPress={useMyLocation}
            disabled={locating}
            accessibilityLabel="Use my current location"
          >
            {locating
              ? <ActivityIndicator size="small" color={Colors.blue600} />
              : <Ionicons name="locate" size={20} color={Colors.blue600} />}
          </TouchableOpacity>
        </View>

        <View style={st.footer}>
          {!!error && <Text style={st.error}>{error}</Text>}

          <View style={st.addrRow}>
            <Ionicons
              name={tooFar ? 'search' : 'location-sharp'}
              size={18}
              color={tooFar ? Colors.warningText : Colors.blue600}
              style={{ marginTop: 1 }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.addr} numberOfLines={2}>
                {tooFar
                  ? 'Zoom in to your building'
                  : loading
                    ? 'Locating…'
                    : place?.label || 'Move the map to choose a spot'}
              </Text>
              {!!center && (
                <Text style={st.coords} numberOfLines={1}>
                  {tooFar
                    ? 'A pin set this far out sends patients to the wrong place'
                    : `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`}
                </Text>
              )}
            </View>
          </View>

          <View style={st.actions}>
            <TouchableOpacity style={st.cancelBtn} onPress={onClose}>
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.confirmBtn, (!center || tooFar) && st.confirmDisabled]}
              onPress={confirm}
              disabled={!center || tooFar}
            >
              <Text style={st.confirmText}>Confirm location</Text>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.gray900 },
  sub:   { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },

  searchWrap: { paddingHorizontal: 18, paddingBottom: 10, zIndex: 10 },

  mapWrap: { flex: 1, backgroundColor: Colors.gray200 },
  centreLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  loadingText:  { marginTop: 10, fontSize: 13, color: Colors.gray500 },

  pinWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  pinShadow: {
    width: 10, height: 5, borderRadius: 5, backgroundColor: Colors.gray900, marginTop: -4,
  },

  locateBtn: {
    position: 'absolute', right: 14, bottom: 14,
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },

  footer: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: Colors.gray200, backgroundColor: Colors.white,
  },
  error: {
    fontSize: 12.5, color: Colors.errorText, backgroundColor: Colors.errorBg,
    borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10,
  },
  addrRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 14 },
  addr:    { fontSize: 14, fontWeight: '600', color: Colors.gray900, lineHeight: 20 },
  coords:  { fontSize: 11.5, color: Colors.gray400, marginTop: 2 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: {
    paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: Colors.gray100,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.gray700 },
  confirmBtn: {
    paddingVertical: 11, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: Colors.blue600,
  },
  confirmDisabled: { backgroundColor: Colors.gray200 },
  confirmText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
