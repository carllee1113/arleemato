import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function FloatingAuthPanel({ visible, onClose }) {
  const { signIn, signUp, error } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleSubmit = async () => {
    setLoading(true);
    const action = mode === 'login' ? signIn : signUp;
    const { error: err } = await action(email.trim(), password);
    setLoading(false);
    if (!err) onClose?.();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <Text style={styles.title}>{mode === 'login' ? 'Login' : 'Register'}</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'login' ? styles.modeBtnActive : null]}
            onPress={() => setMode('login')}
          >
            <Text style={styles.modeText}>LOGIN</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'register' ? styles.modeBtnActive : null]}
            onPress={() => setMode('register')}
          >
            <Text style={styles.modeText}>REGISTER</Text>
          </Pressable>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#5F7F5F"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#5F7F5F"
          secureTextEntry
          style={styles.input}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.primaryText}>{loading ? '...' : (mode === 'login' ? 'LOGIN' : 'REGISTER')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryText}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  panel: {
    marginTop: 0,
    padding: 12,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
    width: '92%',
    maxWidth: 420,
  },
  title: {
    color: '#9FEA8F',
    fontSize: 18,
    fontFamily: 'VT323_400Regular',
    marginBottom: 8,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#334033',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F120F',
  },
  modeBtnActive: {
    borderColor: '#8FD97C',
  },
  modeText: {
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
  },
  input: {
    minHeight: 44,
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    marginBottom: 8,
    borderRadius: 6,
  },
  errorText: {
    color: '#F28C28',
    fontSize: 14,
    fontFamily: 'VT323_400Regular',
    marginBottom: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 6,
  },
  primaryBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#8FD97C',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111411',
  },
  primaryText: {
    color: '#9FEA8F',
    letterSpacing: 1.5,
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    textAlign: 'center',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#334033',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F120F',
  },
  secondaryText: {
    color: '#9FEA8F',
    letterSpacing: 1.5,
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    textAlign: 'center',
  },
});