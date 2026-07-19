/**
 * components/ErrorBoundary.tsx
 *
 * Catches render-time errors anywhere below it and shows a friendly recovery
 * screen instead of white-screening the whole app.
 */

import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong.',
    };
  }

  componentDidCatch(error: unknown) {
    // Surface to the console for debugging; a crash reporter could hook in here.
    console.error('Unhandled UI error:', error);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>😵</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>
          The app hit an unexpected error. Please try again.
        </Text>
        {!!this.state.message && (
          <Text style={styles.detail} numberOfLines={3}>{this.state.message}</Text>
        )}
        <TouchableOpacity style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: Colors.bg },
  title: { fontSize: 22, fontWeight: '800', color: Colors.gray900, marginBottom: 8, textAlign: 'center' },
  sub:   { fontSize: 14, color: Colors.gray500, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  detail:{ fontSize: 12, color: Colors.gray400, textAlign: 'center', marginBottom: 24, fontFamily: 'monospace' },
  btn:    { backgroundColor: Colors.blue600, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  btnText:{ color: Colors.white, fontWeight: '700', fontSize: 15 },
});
