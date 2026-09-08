import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

const HOLD_MS = 1400;
const FADE_MS = 400;

/**
 * Renders the shop's Shreeji image full-screen once, on cold start, then
 * hands off to the real app. The native splash (app.json's plain background
 * colour) is kept on screen via SplashScreen.preventAutoHideAsync() — called
 * at module scope in App.tsx — until this component has mounted, so there is
 * no blank frame between the native splash and this image.
 */
export const BootSplash: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    void SplashScreen.hideAsync().catch(() => {});

    holdTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        if (mounted) onFinish();
      });
    }, HOLD_MS);

    return () => {
      mounted = false;
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [onFinish, opacity]);

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
      <Image
        source={require('../../asset/shreeji-enhanced.jpg')}
        style={styles.image}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1c1917',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  image: { width: '72%', height: '45%' },
});
