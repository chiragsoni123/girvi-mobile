import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { logError } from '../lib/errors';
import { neutral, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  /** Called when the user taps "Try again" — used to remount the tree. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Catches render-time crashes so a bug in one screen shows a recoverable
 * message instead of a white screen with the ledger apparently gone.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError('ErrorBoundary', error);
    this.setState({ info: info.componentStack ?? null });
  }

  private handleReset = () => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>!</Text>
          </View>

          <Text style={styles.title}>The app hit a problem</Text>
          <Text style={styles.body}>
            Something went wrong while drawing this screen. Your data is safe — everything is
            stored on the server, not on this phone.
          </Text>

          <Pressable onPress={this.handleReset} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>

          {__DEV__ && (
            <View style={styles.debug}>
              <Text style={styles.debugTitle}>Developer details</Text>
              <Text style={styles.debugText}>{error.message}</Text>
              {!!info && <Text style={styles.debugText}>{info.slice(0, 900)}</Text>}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neutral[950] },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f43f5e',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  badgeText: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  title: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    color: neutral[400],
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#0c0a09', fontSize: 14, fontWeight: '800' },
  debug: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: neutral[900],
    borderWidth: 1,
    borderColor: neutral[800],
  },
  debugTitle: { color: neutral[400], fontSize: 10.5, fontWeight: '800', marginBottom: 6 },
  debugText: { color: neutral[400], fontSize: 10, fontFamily: 'monospace', lineHeight: 15 },
});
