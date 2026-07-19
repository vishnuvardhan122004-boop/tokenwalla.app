/**
 * app/(hospital)/profile.tsx — Hospital profile & operations hub.
 *
 * Shows the hospital's details and the operations a hospital can perform
 * (dashboard, QR scanner, doctor management, logout, support). Also provides
 * an edit form for the hospital's own details.
 *
 * NOTE: saving edits calls  PATCH /hospitals/:id/  which the backend must
 * support (currently HospitalDetailView is GET-only). Until that endpoint
 * exists server-side, Save shows a friendly error instead of failing silently.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import API, { logoutUser } from '../../services/api';
import { pickImageFile, type PickedImage } from '../../utils/imagePicker';
import { safeBack } from '../../utils/navigation';

interface Hospital {
  id: number | string;
  name?: string;
  city?: string;
  address?: string;
  location?: string;
  mobile?: string;
  status?: string;
  instagram?: string;
  youtube?: string;
  facebook?: string;
  services?: string[];
  description?: string;
  announcement?: string;
  open_time?: string;
  close_time?: string;
  image?: string;
  logo?: string;
  gallery?: { id: number; url: string }[];
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  approved: { bg: Colors.successBg, text: Colors.successText, border: Colors.successBorder, label: '✅ Approved' },
  active:   { bg: Colors.successBg, text: Colors.successText, border: Colors.successBorder, label: '✅ Active'   },
  pending:  { bg: Colors.warningBg, text: Colors.warningText, border: Colors.warningBorder, label: '⏳ Pending Approval' },
  rejected: { bg: Colors.errorBg,   text: Colors.errorText,   border: Colors.errorBorder,   label: '⛔ Rejected' },
};

export default function HospitalProfile() {
  const router = useRouter();

  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({ name: '', city: '', address: '', location: '', mobile: '', instagram: '', youtube: '', facebook: '', description: '', announcement: '', open_time: '', close_time: '' });
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState('');

  // Images
  const [bannerFile,    setBannerFile]    = useState<PickedImage | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [logoFile,      setLogoFile]      = useState<PickedImage | null>(null);
  const [logoPreview,   setLogoPreview]   = useState<string | null>(null);
  const [gallery,       setGallery]       = useState<{ id: number; url: string }[]>([]);
  const [photoBusy,     setPhotoBusy]     = useState(false);

  // OTP state for a mobile change
  const [origMobile,  setOrigMobile]  = useState('');
  const [otp,         setOtp]         = useState('');
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading,  setOtpLoading]  = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) { router.replace('/(hospital)/login'); return; }
      const user = JSON.parse(raw);
      if (user.role !== 'hospital' || !user.hospital) { router.replace('/(hospital)/login'); return; }
      const h: Hospital = user.hospital;
      setHospital(h);
      setOrigMobile(h.mobile || '');
      setForm({
        name: h.name || '', city: h.city || '', address: h.address || '', location: h.location || '', mobile: h.mobile || '',
        instagram: h.instagram || '', youtube: h.youtube || '', facebook: h.facebook || '',
        description: h.description || '', announcement: h.announcement || '', open_time: h.open_time || '', close_time: h.close_time || '',
      });
      setServices(Array.isArray(h.services) ? h.services : []);
      setBannerPreview(h.image || null);
      setLogoPreview(h.logo || null);
      setGallery(Array.isArray(h.gallery) ? h.gallery : []);

      // Doctor count (public read)
      try {
        const { data } = await API.get(`/doctors/?hospital=${h.id}`);
        const list = Array.isArray(data) ? data : (data.results || []);
        setDoctorCount(list.length);
      } catch { /* ignore */ }
    })();
  }, []);

  const mobileChanged = form.mobile.trim() !== origMobile;
  const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m.trim());

  const sendOtp = async () => {
    if (!isValidMobile(form.mobile)) { Alert.alert('Invalid', 'Enter a valid 10-digit mobile number.'); return; }
    setOtpLoading(true);
    try {
      await API.post('/auth/otp/request/', { mobile: form.mobile.trim(), via: 'sms' });
      setOtpSent(true); setOtpVerified(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not send OTP. Try again.');
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setOtpLoading(true);
    try {
      const { data } = await API.post('/auth/otp/verify/', { mobile: form.mobile.trim(), otp: otp.trim() });
      if (data?.verified) { setOtpVerified(true); Alert.alert('✅ Verified', 'New mobile number verified.'); }
      else Alert.alert('Invalid OTP', 'Please check and try again.');
    } catch (e: any) {
      Alert.alert('Invalid OTP', e?.response?.data?.message || 'Please try again.');
    } finally { setOtpLoading(false); }
  };

  const pickBanner = async () => {
    const f = await pickImageFile([16, 9]);
    if (f) { setBannerFile(f); setBannerPreview(f.uri); }
  };
  const pickLogo = async () => {
    const f = await pickImageFile([1, 1]);
    if (f) { setLogoFile(f); setLogoPreview(f.uri); }
  };

  // Gallery photos upload/delete immediately (separate from the text save).
  const addPhoto = async () => {
    if (!hospital) return;
    const f = await pickImageFile([4, 3]);
    if (!f) return;
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', { uri: f.uri, name: f.name, type: f.type } as any);
      const { data } = await API.post(`/hospitals/${hospital.id}/photos/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setGallery(prev => [{ id: data.id, url: data.url }, ...prev]);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404 || status === 405) Alert.alert('Not available yet', 'Photo gallery isn’t enabled on the server yet.');
      else Alert.alert('Error', e?.response?.data?.message || 'Could not upload photo.');
    } finally { setPhotoBusy(false); }
  };

  const removePhoto = (photoId: number) => {
    if (!hospital) return;
    Alert.alert('Remove Photo', 'Delete this photo from your gallery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await API.delete(`/hospitals/${hospital.id}/photos/${photoId}/`);
          setGallery(prev => prev.filter(p => p.id !== photoId));
        } catch (e: any) {
          Alert.alert('Error', e?.response?.data?.message || 'Could not remove photo.');
        }
      } },
    ]);
  };

  const addService = () => {
    const s = newService.trim();
    if (!s) return;
    setServices(prev => (prev.includes(s) ? prev : [...prev, s]));
    setNewService('');
  };
  const removeService = (s: string) => setServices(prev => prev.filter(x => x !== s));

  const handleSave = async () => {
    if (!hospital) return;
    if (!form.name.trim()) { Alert.alert('Validation', 'Hospital name is required'); return; }
    if (mobileChanged && !otpVerified) { Alert.alert('Verify Mobile', 'Please verify the new mobile number with OTP first.'); return; }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name:      form.name.trim(),
        city:      form.city.trim(),
        address:   form.address.trim(),
        location:  form.location.trim(),
        instagram: form.instagram.trim(),
        youtube:   form.youtube.trim(),
        facebook:  form.facebook.trim(),
        description:  form.description.trim(),
        announcement: form.announcement.trim(),
        open_time:    form.open_time.trim(),
        close_time:   form.close_time.trim(),
        services,
      };
      if (mobileChanged) body.mobile = form.mobile.trim();
      const { data } = await API.patch(`/hospitals/${hospital.id}/`, body);

      // Upload banner / logo (multipart) if changed.
      let imgData: any = {};
      if (bannerFile || logoFile) {
        const fd = new FormData();
        if (bannerFile) fd.append('image', { uri: bannerFile.uri, name: bannerFile.name, type: bannerFile.type } as any);
        if (logoFile)   fd.append('logo',  { uri: logoFile.uri,   name: logoFile.name,   type: logoFile.type } as any);
        const res = await API.patch(`/hospitals/${hospital.id}/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        imgData = res.data || {};
        setBannerFile(null); setLogoFile(null);
      }

      const updated: Hospital = { ...hospital, ...data, ...form, services, ...imgData, gallery };
      setHospital(updated);
      setOrigMobile(updated.mobile || '');
      setOtpSent(false); setOtpVerified(false); setOtp('');
      // Persist back into the stored user so the dashboard shows the new name.
      const raw = await AsyncStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw);
        user.hospital = updated;
        await AsyncStorage.setItem('user', JSON.stringify(user));
      }
      setEditing(false);
      Alert.alert('✅ Saved', 'Hospital details updated.');
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404 || status === 405 || status === 403) {
        Alert.alert(
          'Not available yet',
          'Editing hospital details isn’t enabled on the server yet. Please contact support to update your details.',
        );
      } else {
        Alert.alert('Error', e?.response?.data?.message || 'Could not save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => { logoutUser().catch(() => {}); } },
    ]);
  };

  if (!hospital) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.blue600} />
      </View>
    );
  }

  const st = STATUS_STYLE[(hospital.status || '').toLowerCase()] || STATUS_STYLE.pending;
  const initials = (hospital.name || 'H').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack(router, '/(hospital)/dashboard')}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hospital Profile</Text>
        <View style={{ width: 90 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Identity card */}
          <View style={styles.card}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <Text style={styles.hospName}>{hospital.name}</Text>
            <Text style={styles.hospMobile}>📱 {hospital.mobile || '—'}</Text>
            <View style={[styles.statusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[styles.statusText, { color: st.text }]}>{st.label}</Text>
            </View>
          </View>

          {/* Details / edit */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Hospital Details</Text>
              {!editing && (
                <TouchableOpacity onPress={() => setEditing(true)}>
                  <Text style={styles.editLink}>✏️ Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {editing ? (
              <>
                {/* Banner + logo */}
                <Text style={styles.label}>🖼️ Banner Image (16:9)</Text>
                {bannerPreview ? (
                  <Image source={{ uri: bannerPreview }} style={styles.bannerPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.bannerPlaceholder}><Text style={{ fontSize: 26 }}>🏥</Text></View>
                )}
                <TouchableOpacity style={styles.pickBtn} onPress={pickBanner}>
                  <Text style={styles.pickBtnText}>{bannerPreview ? '🔄 Change Banner' : '📷 Choose Banner'}</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { marginTop: 14 }]}>⭕ Logo (square)</Text>
                <View style={styles.logoRow}>
                  {logoPreview ? (
                    <Image source={{ uri: logoPreview }} style={styles.logoPreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.logoPlaceholder}><Text style={{ fontSize: 22 }}>🏥</Text></View>
                  )}
                  <TouchableOpacity style={[styles.pickBtn, { flex: 1 }]} onPress={pickLogo}>
                    <Text style={styles.pickBtnText}>{logoPreview ? '🔄 Change Logo' : '📷 Choose Logo'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 14 }} />

                <Text style={styles.label}>Hospital Name *</Text>
                <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} placeholder="Hospital name" placeholderTextColor={Colors.gray400} />
                <Text style={styles.label}>City</Text>
                <TextInput style={styles.input} value={form.city} onChangeText={v => setForm(p => ({ ...p, city: v }))} placeholder="City" placeholderTextColor={Colors.gray400} />
                <Text style={styles.label}>Address</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} placeholder="Full address" placeholderTextColor={Colors.gray400} multiline />

                <Text style={styles.label}>📍 Maps Location (Google Maps link or landmark)</Text>
                <TextInput style={styles.input} value={form.location} onChangeText={v => setForm(p => ({ ...p, location: v }))} placeholder="https://maps.google.com/…  or landmark" placeholderTextColor={Colors.gray400} autoCapitalize="none" />

                <Text style={styles.label}>Mobile Number</Text>
                <TextInput
                  style={styles.input}
                  value={form.mobile}
                  onChangeText={v => { setForm(p => ({ ...p, mobile: v.replace(/\D/g, '') })); setOtpSent(false); setOtpVerified(false); }}
                  placeholder="10-digit mobile"
                  placeholderTextColor={Colors.gray400}
                  keyboardType="numeric"
                  maxLength={10}
                />

                {mobileChanged && !otpVerified && (
                  <View style={styles.otpBox}>
                    <Text style={styles.otpHint}>Changing the hospital mobile requires OTP verification.</Text>
                    {!otpSent ? (
                      <TouchableOpacity style={styles.otpBtn} onPress={sendOtp} disabled={otpLoading}>
                        {otpLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.otpBtnText}>Send OTP to new number</Text>}
                      </TouchableOpacity>
                    ) : (
                      <>
                        <View style={styles.otpRow}>
                          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={otp} onChangeText={setOtp} placeholder="Enter OTP" placeholderTextColor={Colors.gray400} keyboardType="numeric" maxLength={6} />
                          <TouchableOpacity style={styles.verifyBtn} onPress={verifyOtp} disabled={otpLoading}>
                            {otpLoading ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.verifyBtnText}>Verify</Text>}
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={sendOtp}><Text style={styles.resendText}>Resend OTP</Text></TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
                {mobileChanged && otpVerified && <Text style={styles.verifiedText}>✓ New mobile verified</Text>}

                {/* About / description */}
                <Text style={styles.label}>ℹ️ About the Hospital (shown to patients)</Text>
                <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} value={form.description} onChangeText={v => setForm(p => ({ ...p, description: v }))} placeholder="Describe your hospital, specialities and what you provide…" placeholderTextColor={Colors.gray400} multiline />

                {/* Announcement */}
                <Text style={styles.label}>📢 Announcement / Notice (shown to patients)</Text>
                <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} value={form.announcement} onChangeText={v => setForm(p => ({ ...p, announcement: v }))} placeholder="e.g. Dr. Ravi on leave this Friday" placeholderTextColor={Colors.gray400} multiline maxLength={300} />

                {/* Working hours */}
                <Text style={styles.label}>🕐 Working Hours (24h, e.g. 09:00 – 18:00)</Text>
                <View style={styles.otpRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={form.open_time} onChangeText={v => setForm(p => ({ ...p, open_time: v }))} placeholder="Open 09:00" placeholderTextColor={Colors.gray400} maxLength={5} />
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={form.close_time} onChangeText={v => setForm(p => ({ ...p, close_time: v }))} placeholder="Close 18:00" placeholderTextColor={Colors.gray400} maxLength={5} />
                </View>
                <View style={{ height: 14 }} />

                {/* Social links */}
                <Text style={styles.label}>📸 Instagram Link</Text>
                <TextInput style={styles.input} value={form.instagram} onChangeText={v => setForm(p => ({ ...p, instagram: v }))} placeholder="https://instagram.com/yourhospital" placeholderTextColor={Colors.gray400} autoCapitalize="none" keyboardType="url" />
                <Text style={styles.label}>▶️ YouTube Link</Text>
                <TextInput style={styles.input} value={form.youtube} onChangeText={v => setForm(p => ({ ...p, youtube: v }))} placeholder="https://youtube.com/@yourhospital" placeholderTextColor={Colors.gray400} autoCapitalize="none" keyboardType="url" />
                <Text style={styles.label}>👍 Facebook Link</Text>
                <TextInput style={styles.input} value={form.facebook} onChangeText={v => setForm(p => ({ ...p, facebook: v }))} placeholder="https://facebook.com/yourhospital" placeholderTextColor={Colors.gray400} autoCapitalize="none" keyboardType="url" />

                {/* Services */}
                <Text style={styles.label}>🏥 Services Offered</Text>
                <View style={styles.otpRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={newService}
                    onChangeText={setNewService}
                    placeholder="e.g. X-Ray, Pharmacy, ICU"
                    placeholderTextColor={Colors.gray400}
                    onSubmitEditing={addService}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.verifyBtn} onPress={addService}>
                    <Text style={styles.verifyBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {services.length > 0 && (
                  <View style={styles.chipWrap}>
                    {services.map(s => (
                      <TouchableOpacity key={s} style={styles.serviceChip} onPress={() => removeService(s)}>
                        <Text style={styles.serviceChipText}>{s}  ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setEditing(false);
                      setForm({ name: hospital.name || '', city: hospital.city || '', address: hospital.address || '', location: hospital.location || '', mobile: hospital.mobile || '', instagram: hospital.instagram || '', youtube: hospital.youtube || '', facebook: hospital.facebook || '', description: hospital.description || '', announcement: hospital.announcement || '', open_time: hospital.open_time || '', close_time: hospital.close_time || '' });
                      setServices(Array.isArray(hospital.services) ? hospital.services : []);
                      setNewService('');
                      setOtpSent(false); setOtpVerified(false); setOtp('');
                    }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {[
                  { label: 'City',     value: hospital.city     || '—' },
                  { label: 'Address',  value: hospital.address  || '—' },
                  { label: 'Location', value: hospital.location || '—' },
                  { label: 'Mobile',   value: hospital.mobile   || '—' },
                  { label: 'Doctors',  value: doctorCount == null ? '…' : String(doctorCount) },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{label}</Text>
                    <Text style={styles.detailValue}>{value}</Text>
                  </View>
                ))}

                {/* About */}
                {hospital.description ? (
                  <View style={{ paddingTop: 12 }}>
                    <Text style={styles.detailLabel}>About</Text>
                    <Text style={{ fontSize: 13, color: Colors.gray700, lineHeight: 19, marginTop: 4 }}>{hospital.description}</Text>
                  </View>
                ) : null}

                {/* Social links */}
                {(hospital.instagram || hospital.youtube || hospital.facebook) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Social</Text>
                    <Text style={styles.detailValue}>
                      {[hospital.instagram && '📸', hospital.youtube && '▶️', hospital.facebook && '👍'].filter(Boolean).join('  ')}
                    </Text>
                  </View>
                )}

                {/* Services */}
                {Array.isArray(hospital.services) && hospital.services.length > 0 && (
                  <View style={{ paddingTop: 12 }}>
                    <Text style={styles.detailLabel}>Services</Text>
                    <View style={styles.chipWrap}>
                      {hospital.services.map(s => (
                        <View key={s} style={styles.serviceChip}><Text style={styles.serviceChipText}>{s}</Text></View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Photo gallery */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Photo Gallery</Text>
              <TouchableOpacity onPress={addPhoto} disabled={photoBusy}>
                {photoBusy ? <ActivityIndicator size="small" color={Colors.blue600} /> : <Text style={styles.editLink}>＋ Add Photo</Text>}
              </TouchableOpacity>
            </View>
            {gallery.length === 0 ? (
              <Text style={{ fontSize: 13, color: Colors.gray400 }}>No photos yet. Add facility photos patients can see.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {gallery.map(p => (
                  <TouchableOpacity key={p.id} onPress={() => removePhoto(p.id)} activeOpacity={0.8}>
                    <Image source={{ uri: p.url }} style={styles.galleryImg} resizeMode="cover" />
                    <View style={styles.galleryRemove}><Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700' }}>✕</Text></View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Operations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operations</Text>
            {[
              { icon: '🏥', label: 'Queue & Doctors Dashboard', onPress: () => router.replace('/(hospital)/dashboard') },
              { icon: '📊', label: 'Analytics',                 onPress: () => router.push('/(hospital)/analytics')    },
              { icon: '📷', label: 'Scan Patient QR',           onPress: () => router.push('/(hospital)/scanner')      },
              { icon: '🔑', label: 'Change Password',           onPress: () => router.push('/(hospital)/Hforgotpassword') },
              { icon: '📞', label: 'Contact Support',           onPress: () => Linking.openURL('mailto:support@tokenwalla.com') },
            ].map(({ icon, label, onPress }) => (
              <TouchableOpacity key={label} style={styles.opRow} onPress={onPress}>
                <View style={styles.opIcon}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
                <Text style={styles.opLabel}>{label}</Text>
                <Text style={styles.opArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
            <Text style={styles.logoutBtnText}>🚪 Logout</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.blue100, backgroundColor: Colors.white },
  backBtn:     { width: 90 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.blue600 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },

  card:      { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 16 },
  avatar:    { width: 76, height: 76, borderRadius: 20, backgroundColor: Colors.blue600, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:{ fontSize: 26, fontWeight: '800', color: Colors.white },
  hospName:  { fontSize: 19, fontWeight: '800', color: Colors.gray900, textAlign: 'center', marginBottom: 4 },
  hospMobile:{ fontSize: 13, color: Colors.gray500, marginBottom: 12 },
  statusPill:{ borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 5 },
  statusText:{ fontSize: 12, fontWeight: '700' },

  section:     { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:{ fontSize: 15, fontWeight: '800', color: Colors.gray900, marginBottom: 12 },
  editLink:    { fontSize: 13, fontWeight: '700', color: Colors.blue600 },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  detailLabel: { fontSize: 13, color: Colors.gray500 },
  detailValue: { fontSize: 13, fontWeight: '600', color: Colors.gray900, flexShrink: 1, textAlign: 'right', maxWidth: '65%' },

  label: { fontSize: 12, fontWeight: '700', color: Colors.gray600, marginBottom: 7 },
  input: { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.blue100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.gray900, marginBottom: 14 },
  otpBox:    { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, padding: 14, marginBottom: 14 },
  otpHint:   { fontSize: 12, color: Colors.blue700, marginBottom: 10 },
  otpBtn:    { backgroundColor: Colors.blue600, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  otpBtnText:{ color: Colors.white, fontWeight: '700', fontSize: 14 },
  otpRow:    { flexDirection: 'row', gap: 8, marginBottom: 8 },
  verifyBtn: { backgroundColor: Colors.blue600, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  verifyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  resendText: { fontSize: 13, color: Colors.blue600, fontWeight: '600' },
  verifiedText: { fontSize: 13, color: Colors.successText, fontWeight: '700', marginBottom: 14 },

  bannerPreview:     { width: '100%', height: 120, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue200, marginBottom: 8 },
  bannerPlaceholder: { width: '100%', height: 100, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  logoRow:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoPreview:       { width: 60, height: 60, borderRadius: 14, borderWidth: 2, borderColor: Colors.blue200 },
  logoPlaceholder:   { width: 60, height: 60, borderRadius: 14, borderWidth: 1, borderColor: Colors.blue100, backgroundColor: Colors.blue50, alignItems: 'center', justifyContent: 'center' },
  pickBtn:           { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  pickBtnText:       { fontSize: 13, fontWeight: '700', color: Colors.blue700 },
  galleryImg:        { width: 120, height: 90, borderRadius: 12, borderWidth: 1, borderColor: Colors.blue100 },
  galleryRemove:     { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(163,45,45,0.9)', alignItems: 'center', justifyContent: 'center' },

  chipWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 6 },
  serviceChip: { backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  serviceChipText: { fontSize: 12, fontWeight: '600', color: Colors.blue700 },

  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn:   { flex: 1, borderWidth: 1, borderColor: Colors.blue200, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: Colors.gray600 },
  saveBtn:     { flex: 1, backgroundColor: Colors.blue600, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  opRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  opIcon:  { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.blue50, borderWidth: 1, borderColor: Colors.blue100, alignItems: 'center', justifyContent: 'center' },
  opLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.gray800 },
  opArrow: { fontSize: 22, color: Colors.gray400 },

  logoutBtn:     { backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  logoutBtnText: { color: Colors.errorText, fontWeight: '700', fontSize: 15 },
});
