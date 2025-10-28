import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Landing({ onOpenAuth }) {
  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        <Text style={styles.title}>Pomodoro Technique</Text>
        <Text style={styles.copy}>
          Focus in short, intense blocks (usually 25 minutes) followed by brief breaks.
          Repeat cycles to build sustainable concentration, reduce burnout, and make
          progress visible.
        </Text>
        <Pressable style={styles.button} onPress={onOpenAuth}>
          <Text style={styles.buttonText}>Login / Register</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    width: '88%',
    maxWidth: 420,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#111411',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    color: '#9FEA8F',
    fontSize: 22,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'VT323_400Regular',
  },
  copy: {
    color: '#9FEA8F',
    fontSize: 16,
    marginBottom: 14,
    fontFamily: 'VT323_400Regular',
  },
  button: {
    borderWidth: 2,
    borderColor: '#8FD97C',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111411',
  },
  buttonText: {
    color: '#9FEA8F',
    letterSpacing: 1.5,
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    textAlign: 'center',
  },
});