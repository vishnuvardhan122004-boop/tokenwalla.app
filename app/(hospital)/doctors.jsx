import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';

export default function HospitalDoctors() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Manage Doctors</Text>
      <Text style={styles.sub}>Use the web dashboard to add/edit doctors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg, padding: 24 },
  text: { fontSize: 20, fontWeight: '800', color: Colors.gray900, marginBottom: 8 },
  sub:  { fontSize: 14, color: Colors.gray500, textAlign: 'center' },
});