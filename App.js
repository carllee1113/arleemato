import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Pressable, Platform, TextInput } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts, VT323_400Regular } from '@expo-google-fonts/vt323';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './components/Landing';
import FloatingAuthPanel from './components/FloatingAuthPanel';
import { supabase } from './lib/supabaseClient';
 

const DEFAULT_WORK_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;

const STATES = {
  WORK: 'WORK',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK: 'LONG_BREAK',
  PAUSED: 'PAUSED',
};

 export default function App() {
   return (
     <AuthProvider>
       <AppWithAuth />
     </AuthProvider>
   );
 }

 function AppWithAuth() {
   const { session } = useAuth();
   const [showAuthPanel, setShowAuthPanel] = useState(false);
   // Fonts are needed both for landing and timer UI
   const [fontsLoaded] = useFonts({ VT323_400Regular });
   if (!fontsLoaded) return null;
   if (!session) {
     return (
       <>
         <Landing onOpenAuth={() => setShowAuthPanel(true)} />
         <FloatingAuthPanel visible={showAuthPanel} onClose={() => setShowAuthPanel(false)} />
       </>
     );
   }
   return <TimerApp />;
 }

 function TimerApp() {
  const [fontsLoaded] = useFonts({
    VT323_400Regular,
    DSEG7ClassicBoldItalic: require('./assets/fonts/DSEG7Classic-BoldItalic.ttf'),
  });
  const { session, signOut } = useAuth();
  const [state, setState] = useState(STATES.WORK);
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [planCompleted, setPlanCompleted] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(DEFAULT_WORK_SECONDS);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_BREAK_SECONDS);
  const [totalSessions, setTotalSessions] = useState(4); // 1..8
  const [remaining, setRemaining] = useState(focusSeconds);
  const [completedCycles, setCompletedCycles] = useState(0); // 0..totalSessions
  const startTimestampRef = useRef(null);
  const lastTickRef = useRef(null);
  const lastWorkElapsedRef = useRef(0);

  // --- Sound helpers (web-only) ---
  const audioCtxRef = useRef(null);
  const ensureAudioCtx = () => {
    if (Platform.OS !== 'web') return null;
    if (!audioCtxRef.current) {
      const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (AC) audioCtxRef.current = new AC();
 }
    return audioCtxRef.current;
  };

  const playToneWeb = (frequency = 880, durationSec = 0.12, volume = 0.03, whenDelaySec = 0) => {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + whenDelaySec;
    osc.start(startAt);
    osc.stop(startAt + durationSec);
  };

  const playBeep = (count = 1) => {
    if (Platform.OS === 'web') {
      for (let i = 0; i < count; i++) {
        playToneWeb(880, 0.12, 0.03, i * 0.18);
      }
    } else {
      // Native platforms: placeholder (no-op). Consider expo-av in future.
    }
  };

  const playDoorbell = () => {
    if (Platform.OS === 'web') {
      // Simple two-tone ding-dong approximation
      playToneWeb(880, 0.12, 0.03, 0);
      playToneWeb(660, 0.18, 0.03, 0.2);
    } else {
      // Native platforms: placeholder (no-op). Consider expo-av in future.
    }
  };

  // Notes accumulation and download prompt states (declare early for effects)
  const [noteMode, setNoteMode] = useState(null); // 'NOTE' | 'DO_LATER' | 'IDEA' | null
  const [noteEntries, setNoteEntries] = useState([]); // accumulated entries across sessions
  const [noteDraftHeader, setNoteDraftHeader] = useState(''); // e.g., "YYYY-MM-DD HH:mm Notes: "
  const [noteDraftBody, setNoteDraftBody] = useState('');
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyMap, setHistoryMap] = useState({});
  const HISTORY_KEY = 'pomodoroHistory';

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        setHistoryMap(raw ? JSON.parse(raw) : {});
      } catch (e) {}
    })();
  }, []);

  // When opening history and logged in, fetch Supabase-backed history
  useEffect(() => {
    if (!showHistory) return;
    const userId = session?.user?.id;
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase
        .from('pomodoro_sessions')
        .select('started_at, created_at')
        .eq('user_id', userId);
      if (error || !data) return;
      const map = {};
      for (const row of data) {
        const ts = row.started_at || row.created_at;
        if (!ts) continue;
        const day = String(ts).slice(0, 10);
        map[day] = (map[day] || 0) + 1;
      }
      setHistoryMap(map);
    })();
  }, [showHistory, session]);

  const recordDailyCompletion = async () => {
    try {
      if ((lastWorkElapsedRef.current || 0) < 5 * 60) {
        return;
      }
      const day = new Date().toISOString().slice(0, 10);
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[day] = (map[day] || 0) + 1;
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(map));
      setHistoryMap(map);

      // Also record to Supabase when authenticated
      const userId = session?.user?.id;
      if (userId) {
        await supabase.from('pomodoro_sessions').insert({
          user_id: userId,
          started_at: new Date().toISOString(),
          duration_seconds: Math.floor(lastWorkElapsedRef.current || 0),
          is_work: true,
          note_count: Array.isArray(noteEntries) ? noteEntries.length : 0,
        });
      }
    } catch (e) {}
  };

  const label = useMemo(() => {
    switch (state) {
      case STATES.WORK:
        return 'WORK';
      case STATES.SHORT_BREAK:
        return 'BREAK';
      case STATES.LONG_BREAK:
        return 'LONG BREAK';
      default:
        return 'WORK';
    }
  }, [state]);

  useEffect(() => {
    if (!running) return;
    // timestamp-based drift correction
    const now = Date.now();
    if (!startTimestampRef.current) startTimestampRef.current = now;
    lastTickRef.current = now;

    const id = setInterval(() => {
      const t = Date.now();
      const dt = Math.floor((t - lastTickRef.current) / 1000);
      if (dt > 0) {
        setRemaining((prev) => Math.max(0, prev - dt));
        lastTickRef.current = t;
      }
    }, 250);

    return () => clearInterval(id);
  }, [running]);

  // Play beeps on session start
  useEffect(() => {
    if (!running) return;
    // Beep once when a work session starts (at initial remaining)
    if (state === STATES.WORK && remaining === focusSeconds) {
      playBeep(1);
    }
    // Beep twice when a break session starts (at initial remaining)
    if (state === STATES.SHORT_BREAK && remaining === restSeconds) {
      playBeep(2);
    }
  }, [state, running, remaining, focusSeconds, restSeconds]);

  useEffect(() => {
    if (remaining === 0) {
      if (state === STATES.WORK) {
        lastWorkElapsedRef.current = focusSeconds;
        // After any work session, always start a short break.
        setState(STATES.SHORT_BREAK);
        setRemaining(restSeconds);
        setRunning(true);
      } else if (state === STATES.SHORT_BREAK) {
        // A break has just ended. Decide what's next.
        if (completedCycles < totalSessions) {
          // It was not the final session's break. Start the next work session.
          const nextCycles = completedCycles + 1;
          recordDailyCompletion();
          setCompletedCycles(nextCycles);
          setState(STATES.WORK);
          setRemaining(focusSeconds);
          setRunning(true);
        } else {
          // It was the final session's break. The plan is now complete.
          const committed = commitDraftIfAny();
          recordDailyCompletion();
          setRunning(false);
          setPlanCompleted(true);
          setState(STATES.PAUSED);
          setRemaining(focusSeconds);
          playDoorbell();
          if ((noteEntries.length + (committed ? 1 : 0)) > 0) setShowDownloadPrompt(true);
        }
      }
    }
  }, [remaining, state, completedCycles, totalSessions, focusSeconds, restSeconds, noteEntries, noteDraftBody, noteMode]);

  const handlePrimaryPress = () => {
    if (!hasStarted) {
      setHasStarted(true);
      setShowPlan(false);
      setState(STATES.WORK);
      setRemaining(focusSeconds);
      setRunning(true);
      setPlanCompleted(false);
      // Fill first square on initial work start
      setCompletedCycles(1);
      return;
    }
    if (planCompleted) {
      // Restart scheduled sessions
      setCompletedCycles(1);
      setState(STATES.WORK);
      setRemaining(focusSeconds);
      setRunning(true);
      setPlanCompleted(false);
      setShowDownloadPrompt(false);
      setNoteEntries([]);
      setNoteMode(null);
      setNoteDraftHeader('');
      setNoteDraftBody('');
    } else {
      setRunning((r) => {
        const newRunning = !r;
        if (newRunning) {
          // Resume: commit note and hide input
          commitDraftIfAny();
        }
        return newRunning;
      });
    }
  };

  const [showPlan, setShowPlan] = useState(false);
  const [planSessions, setPlanSessions] = useState(totalSessions);
  const [planFocusMins, setPlanFocusMins] = useState(Math.floor(focusSeconds / 60));
  const [planRestMins, setPlanRestMins] = useState(Math.floor(restSeconds / 60));

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const typeLabelFor = (mode) => (mode === 'NOTE' ? 'Notes' : mode === 'DO_LATER' ? 'Do Later' : 'Idea');
  const currentDateTimeStr = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  };
  const currentDateTimeForFilename = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`; // avoid ':' in filenames
    return `${dateStr}_${timeStr}`;
  };
  const buildNoteDisplayPrefix = () => {
    const prev = noteEntries.map((e) => `${e.header}${e.body}`).join('\n');
    return `${prev}${prev.length ? '\n' : ''}${noteDraftHeader}`;
  };
  const handleNoteChange = (text) => {
    const prefix = buildNoteDisplayPrefix();
    if (text.startsWith(prefix)) {
      setNoteDraftBody(text.slice(prefix.length));
    } else {
      const idx = text.lastIndexOf(noteDraftHeader);
      if (idx >= 0) {
        setNoteDraftBody(text.slice(idx + noteDraftHeader.length));
      } else {
        setNoteDraftBody(text);
      }
    }
  };
  const handleNoteResume = () => {
    // Commit any current draft, hide the panel, and resume clock if applicable
    commitDraftIfAny();
    if (hasStarted && !planCompleted) {
      setRunning(true);
    }
  };
  const commitDraftIfAny = () => {
    if (!noteMode) return false;
    const body = (noteDraftBody || '').trim();
    const didCommit = body.length > 0;
    if (didCommit) {
      setNoteEntries((prev) => [...prev, { header: noteDraftHeader, body }]);
    }
    setNoteMode(null);
    setNoteDraftHeader('');
    setNoteDraftBody('');
    return didCommit;
  };
  const getNotesPlainText = () => noteEntries.map((e) => `${e.header}${e.body}`).join('\n');
  const downloadNotes = () => {
    const text = noteMode ? `${buildNoteDisplayPrefix()}${noteDraftBody}` : getNotesPlainText();
    if (Platform.OS === 'web') {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `arleenote${currentDateTimeForFilename()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const getHistoryPlainText = () => {
    const entries = Object.entries(historyMap).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.map(([date, count]) => `${date} ${count || 0}`).join('\n');
  };
  const downloadHistory = () => {
    const text = getHistoryPlainText();
    if (Platform.OS === 'web') {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Filename requested to be date-time stamp only
      link.download = `${currentDateTimeForFilename()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Notion sync
  const [notionSyncTriggered, setNotionSyncTriggered] = useState(false);
  const [notionSyncResult, setNotionSyncResult] = useState(null);
  const getNotionEndpoint = () => {
    try {
      const extra = Constants?.expoConfig?.extra || {};
      return extra.notionEndpoint || '';
    } catch (e) {
      return '';
    }
  };
  const toNotionPayload = (entries) => entries.map((e) => ({ header: e.header, body: e.body }));
  const sendNotesToNotion = async (entries) => {
    const endpoint = getNotionEndpoint();
    if (!endpoint) return false;
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });
      return resp.ok;
    } catch (e) {
      return false;
    }
  };
  useEffect(() => {
  if (showDownloadPrompt) {
    setNotionSyncTriggered(false);
    setNotionSyncResult(null);
  }
}, [showDownloadPrompt]);

  const handleSendToNotion = async () => {
    const ok = await sendNotesToNotion(toNotionPayload(noteEntries));
    setNotionSyncResult(ok);
  };
  const openNote = (mode) => {
    if (noteMode === mode) {
      setNoteMode(null);
      return;
    }
    setNoteMode(mode);
    setNoteDraftHeader(`${currentDateTimeStr()} ${typeLabelFor(mode)}: `);
    setNoteDraftBody('');
    // Pressing notes pauses the clock and switches primary label to Resume
    setRunning(false);
  };

  const applyPlan = (startNow = false) => {
    const newSessions = clamp(planSessions, 1, 8);
    const newFocus = clamp(planFocusMins, 1, 60) * 60;
    const newRest = clamp(planRestMins, 1, 20) * 60;
    setTotalSessions(newSessions);
    setFocusSeconds(newFocus);
    setRestSeconds(newRest);
    setCompletedCycles(0);
    setRunning(Boolean(startNow));
    setState(STATES.WORK);
    setRemaining(newFocus);
    if (startNow) { setShowPlan(false); setHasStarted(true); setPlanCompleted(false); setCompletedCycles(1); }
    // Reset notes and download prompt when applying a new plan
    setNoteEntries([]);
    setShowDownloadPrompt(false);
    setNoteMode(null);
    setNoteDraftHeader('');
    setNoteDraftBody('');
  };

  const passCurrentSession = () => {
    const continueRunning = running;
    if (state === STATES.WORK) {
      lastWorkElapsedRef.current = Math.max(0, focusSeconds - remaining);
      // Passing a work session always takes you to the break.
      setState(STATES.SHORT_BREAK);
      setRemaining(restSeconds);
      setRunning(continueRunning);
    } else if (state === STATES.SHORT_BREAK || state === STATES.LONG_BREAK) {
      // Passing a break. This is where we check for completion.
      if (completedCycles < totalSessions) {
        // Not the final break. Start next work session.
        const nextCycles = completedCycles + 1;
        recordDailyCompletion();
        setCompletedCycles(nextCycles);
        setState(STATES.WORK);
        setRemaining(focusSeconds);
        setRunning(continueRunning);
      } else {
        // It was the final break. End the plan.
        const committed = commitDraftIfAny();
        recordDailyCompletion();
        setRunning(false);
        setPlanCompleted(true);
        setState(STATES.PAUSED);
        setRemaining(focusSeconds);
        playDoorbell();
        if ((noteEntries.length + (committed ? 1 : 0)) > 0) setShowDownloadPrompt(true);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
    } catch (e) {}
    // Sign out from Supabase (triggers Landing render via AppWithAuth)
    try { await signOut(); } catch (e) {}
    setHistoryMap({});
    setHasStarted(false);
    setPlanCompleted(false);
    setRunning(false);
    setCompletedCycles(0);
    setState(STATES.WORK);
    setRemaining(focusSeconds);
    setShowHistory(false);
    setShowHelp(false);
    setShowDownloadPrompt(false);
    setNoteEntries([]);
    setNoteMode(null);
    setNoteDraftHeader('');
    setNoteDraftBody('');
    startTimestampRef.current = null;
    lastTickRef.current = null;
    lastWorkElapsedRef.current = 0;
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Top-right small clock, local environment time
  const [nowStr, setNowStr] = useState('');
  useEffect(() => {
    const update = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      setNowStr(`${hh}:${mm}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // Seven-segment digit rendering
  const SevenSegmentDigit = ({ char, size = 6 }) => {
    const thick = size;
    const w = size * 12;
    const h = size * 20;
    const pad = size;
    const segColor = '#0C0F0C';
    const lengthH = w - 2 * pad;
    const lengthV = Math.floor((h - 3 * thick) / 2);

    if (char === ':') {
      return (
        <View style={{ width: size * 6, height: h, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: thick, height: thick, backgroundColor: segColor, borderRadius: thick / 2, marginBottom: size }} />
          <View style={{ width: thick, height: thick, backgroundColor: segColor, borderRadius: thick / 2, marginTop: size }} />
        </View>
      );
    }

    const segmentsOnMap = {
      '0': ['a', 'b', 'c', 'd', 'e', 'f'],
      '1': ['b', 'c'],
      '2': ['a', 'b', 'g', 'e', 'd'],
      '3': ['a', 'b', 'g', 'c', 'd'],
      '4': ['f', 'g', 'b', 'c'],
      '5': ['a', 'f', 'g', 'c', 'd'],
      '6': ['a', 'f', 'g', 'e', 'c', 'd'],
      '7': ['a', 'b', 'c'],
      '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      '9': ['a', 'b', 'c', 'd', 'f', 'g'],
    };

    const segStyle = {
      a: { position: 'absolute', top: 0, left: pad, width: lengthH, height: thick, backgroundColor: segColor, borderRadius: thick / 2 },
      b: { position: 'absolute', top: thick, right: 0, width: thick, height: lengthV, backgroundColor: segColor, borderRadius: thick / 2 },
      c: { position: 'absolute', bottom: thick, right: 0, width: thick, height: lengthV, backgroundColor: segColor, borderRadius: thick / 2 },
      d: { position: 'absolute', bottom: 0, left: pad, width: lengthH, height: thick, backgroundColor: segColor, borderRadius: thick / 2 },
      e: { position: 'absolute', bottom: thick, left: 0, width: thick, height: lengthV, backgroundColor: segColor, borderRadius: thick / 2 },
      f: { position: 'absolute', top: thick, left: 0, width: thick, height: lengthV, backgroundColor: segColor, borderRadius: thick / 2 },
      g: { position: 'absolute', top: Math.floor(h / 2) - Math.floor(thick / 2), left: pad, width: lengthH, height: thick, backgroundColor: segColor, borderRadius: thick / 2 },
    };

    const segmentsOn = segmentsOnMap[char] || [];
    return (
      <View style={{ width: w, height: h, marginHorizontal: size }}>
        {segmentsOn.map((key) => (
          <View key={key} style={segStyle[key]} />
        ))}
      </View>
    );
  };

  const SevenSegmentDisplay = ({ text, size = 6 }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {text.split('').map((ch, i) => (
        <SevenSegmentDigit key={`${ch}-${i}`} char={ch} size={size} />
      ))}
    </View>
  );

  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={{ color: '#A5FFA5' }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.lcd}>
          <View style={styles.topRow}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable style={styles.helpBtn} onPress={() => setShowHelp((v) => !v)}>
                <Text style={styles.helpBtnText}>?</Text>
              </Pressable>
              <Pressable style={styles.helpBtn} onPress={() => setShowHistory((v) => !v)}>
                <Text style={styles.helpBtnText}>H</Text>
              </Pressable>
            </View>
            <Text style={styles.topValue}>{nowStr}</Text>
          </View>
          <View style={styles.midRow}>
            <Text style={styles.leftLabel}>P {label}</Text>
          </View>
          <View style={styles.timeCenter}>
            <Text style={styles.timeDseg}>{formatTime(remaining)}</Text>
          </View>
          <View style={styles.squaresRow}>
            {Array.from({ length: totalSessions }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.square,
                  i < completedCycles ? styles.squareFilled : styles.squareEmpty,
                ]}
              />
            ))}
          </View>
          <View style={styles.bottomRow}>
            <Text style={styles.bottomLabel}>arleemato</Text>
          </View>
        </View>

        {showPlan && (
          <View style={styles.overlay}>
            <View style={styles.planPanel}>
              <Text style={styles.helpTitle}>Plan</Text>
              <View style={styles.planRow}>
                <Text style={styles.planLabel}>Sessions</Text>
                <View style={styles.planStepper}>
                  <Pressable onPress={() => setPlanSessions(clamp(planSessions - 1, 1, 8))} style={styles.planStepBtn}><Text style={styles.planStepText}>-</Text></Pressable>
                  <Text style={styles.planValue}>{planSessions}</Text>
                  <Pressable onPress={() => setPlanSessions(clamp(planSessions + 1, 1, 8))} style={styles.planStepBtn}><Text style={styles.planStepText}>+</Text></Pressable>
                </View>
              </View>
              <View style={styles.planRow}>
                <Text style={styles.planLabel}>Focus (min)</Text>
                <View style={styles.planStepper}>
                  <Pressable onPress={() => setPlanFocusMins(clamp(planFocusMins - 1, 1, 60))} style={styles.planStepBtn}><Text style={styles.planStepText}>-</Text></Pressable>
                  <Text style={styles.planValue}>{planFocusMins}</Text>
                  <Pressable onPress={() => setPlanFocusMins(clamp(planFocusMins + 1, 1, 60))} style={styles.planStepBtn}><Text style={styles.planStepText}>+</Text></Pressable>
                </View>
              </View>
              <View style={styles.planRow}>
                <Text style={styles.planLabel}>Rest (min)</Text>
                <View style={styles.planStepper}>
                  <Pressable onPress={() => setPlanRestMins(clamp(planRestMins - 1, 1, 20))} style={styles.planStepBtn}><Text style={styles.planStepText}>-</Text></Pressable>
                  <Text style={styles.planValue}>{planRestMins}</Text>
                  <Pressable onPress={() => setPlanRestMins(clamp(planRestMins + 1, 1, 20))} style={styles.planStepBtn}><Text style={styles.planStepText}>+</Text></Pressable>
                </View>
              </View>
              <View style={styles.downloadBtns}>
                <Pressable onPress={() => applyPlan(true)} style={styles.button}>
                  <Text style={styles.buttonText}>START</Text>
                </Pressable>
                <Pressable onPress={() => setShowPlan(false)} style={styles.buttonSecondary}>
                  <Text style={styles.buttonText}>CLOSE</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {!showPlan && (
          <View style={styles.controls}>
            <Pressable onPress={handlePrimaryPress} style={styles.button}>
              <Text style={styles.buttonText}>{!hasStarted ? 'START' : planCompleted ? 'RESTART' : running ? 'PAUSE' : 'RESUME'}</Text>
            </Pressable>
            <Pressable onPress={() => (hasStarted && !planCompleted ? passCurrentSession() : setShowPlan((v) => !v))} style={styles.buttonSecondary}>
              <Text style={styles.buttonText}>{hasStarted && !planCompleted ? 'PASS' : 'PLAN'}</Text>
            </Pressable>
          </View>
        )}

        {showHelp && (
          <View style={styles.overlay}>
            <View style={styles.helpPanel}>
              <Text style={styles.helpTitle}>Instructions</Text>
              <Text style={styles.helpText}>• Press START to begin a focus session.</Text>
              <Text style={styles.helpText}>• Press PAUSE to pause; RESUME to continue.</Text>
              <Text style={styles.helpText}>• Press PASS to move to break or next work.</Text>
              <Text style={styles.helpText}>• Squares below time fill at each WORK start.</Text>
              <Text style={styles.helpText}>• Top-right clock shows local time in 24-hour format.</Text>
              <Text style={styles.helpText}>• Press NOTES / DO LATER / IDEA to open a note field.</Text>
              <Text style={styles.helpText}>• When notes are open, the timer pauses and primary shows RESUME.</Text>
              <Text style={styles.helpText}>• Press RESUME to commit the current note and hide the input.</Text>
              <Text style={styles.helpText}>• At plan end, download notes as a text file if any were entered.</Text>
              <Text style={styles.helpText}>• Press RESTART to start a new plan (clears notes).</Text>
              <Text style={styles.helpText}>• Press PLAN to configure sessions, focus minutes and rest minutes.</Text>
              <View style={styles.planActions}>
                <Pressable style={styles.button} onPress={() => setShowHelp(false)}>
                  <Text style={styles.buttonText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {showHistory && (
          <View style={styles.overlay}>
            <View style={styles.helpPanel}>
              <Text style={styles.helpTitle}>History</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <HistoryHeatmap history={historyMap} weeks={12} />
                </View>
                <View style={{ width: 90, marginLeft: 8, alignItems: 'flex-end' }}>
                  <Text style={{ color: '#9FEA8F', fontSize: 18, fontFamily: 'VT323_400Regular' }}>{Object.values(historyMap).reduce((s,v)=>s+(v||0),0)}</Text>
                  <Text style={{ color: '#5F7F5F', fontSize: 12, fontFamily: 'VT323_400Regular' }}>SESSIONS</Text>
                  <Text style={{ color: '#9FEA8F', fontSize: 18, fontFamily: 'VT323_400Regular', marginTop: 6 }}>{Object.values(historyMap).filter(v=>v>0).length}</Text>
                  <Text style={{ color: '#5F7F5F', fontSize: 12, fontFamily: 'VT323_400Regular' }}>DAYS</Text>
                </View>
              </View>
              <View style={styles.downloadBtns}>
                <Pressable style={styles.button} onPress={downloadNotes}>
                  <Text style={styles.buttonText}>EXPORT NOTES</Text>
                </Pressable>
                <Pressable style={styles.button} onPress={() => setShowHistory(false)}>
                  <Text style={styles.buttonText}>CLOSE</Text>
                </Pressable>
              </View>
              <View style={styles.planActions}>
                <Pressable style={styles.buttonSecondary} onPress={handleLogout}>
                  <Text style={styles.buttonText}>LOGOUT</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Notes / Do Later / Idea quick input bar */}
        <View style={styles.noteBar}>
          <Pressable style={styles.noteBtn} onPress={() => openNote('NOTE')}>
            <Text style={styles.buttonText}>WRITE NOTES</Text>
          </Pressable>
          <Pressable style={styles.noteBtn} onPress={() => openNote('DO_LATER')}>
            <Text style={styles.buttonText}>DO LATER</Text>
          </Pressable>
          <Pressable style={styles.noteBtn} onPress={() => openNote('IDEA')}>
            <Text style={styles.buttonText}>INSTANT IDEA</Text>
          </Pressable>
        </View>

        {noteMode && (
          <View style={styles.overlay}>
            <View style={styles.noteInputPanel}>
              <TextInput
                value={`${buildNoteDisplayPrefix()}${noteDraftBody}`}
                onChangeText={handleNoteChange}
                multiline
                autoFocus
                style={styles.noteInput}
                placeholder="Type here…"
                placeholderTextColor="#5F7F5F"
              />
              <View style={styles.planActions}>
                <Pressable style={styles.button} onPress={handleNoteResume}>
                  <Text style={styles.buttonText}>RESUME</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {showDownloadPrompt && (
  <View style={styles.downloadPanel}>
    <Text style={styles.downloadText}>Sessions complete. Download your notes?</Text>
    <View style={styles.downloadBtns}>
      <Pressable style={styles.buttonSecondary} onPress={downloadNotes}>
        <Text style={styles.buttonText}>DOWNLOAD NOTES</Text>
      </Pressable>
      <Pressable style={styles.buttonSecondary} onPress={() => setShowDownloadPrompt(false)}>
        <Text style={styles.buttonText}>CLOSE</Text>
      </Pressable>
    </View>
  </View>
)}
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
    borderColor: '#2A2E2A',
    borderWidth: 0, // remove outer boundary
    borderRadius: 10,
    backgroundColor: '#111411',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative',
  },
  lcd: {
    borderColor: '#1C1C1C',
    borderWidth: 3,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F28C28',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  topValue: {
    color: '#1A1A1A',
    fontSize: 16,
    letterSpacing: 1,
    fontFamily: 'DSEG7ClassicBoldItalic',
  },
  midRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  leftLabel: {
    color: '#2B2B2B',
    fontSize: 12,
    marginRight: 6,
    fontFamily: 'VT323_400Regular',
  },
  timeBlock: {
    flex: 1,
  },
  indicator: {
    color: '#2B2B2B',
    textAlign: 'left',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
    fontFamily: 'VT323_400Regular',
  },
  timeDseg: {
    color: '#1A1A1A',
    fontSize: 50,
    letterSpacing: 2,
    fontFamily: 'DSEG7ClassicBoldItalic',
  },
  timeCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  squaresRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  planPanel: {
    marginTop: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
    width: '92%',
    alignSelf: 'center',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planLabel: {
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
  },
  planStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planStepBtn: {
    borderWidth: 2,
    borderColor: '#334033',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#111411',
  },
  planStepText: {
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
  },
  planValue: {
    color: '#1A1A1A',
    fontSize: 16,
    letterSpacing: 2,
    fontFamily: 'DSEG7ClassicBoldItalic',
    backgroundColor: '#F28C28',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  planActions: {
    marginTop: 6,
  },
  square: {
    width: 10,
    height: 10,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#D1E37A',
  },
  squareFilled: {
    backgroundColor: '#334033',
  },
  squareEmpty: {
    backgroundColor: 'transparent',
  },
  bottomRow: {
    marginTop: 6,
  },
  bottomLabel: {
    color: '#334033',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'VT323_400Regular',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 16,
  },
  button: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#8FD97C',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111411',
  },
  buttonSecondary: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#334033',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F120F',
  },
  buttonText: {
    color: '#9FEA8F',
    letterSpacing: 1.5,
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    textAlign: 'center',
  },
  noteBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  noteBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#334033',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F120F',
  },
  noteInputPanel: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
    width: '92%',
  },
  noteInput: {
    minHeight: 80,
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helpBtn: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  helpBtnText: {
    color: '#9FEA8F',
    fontSize: 16,
    letterSpacing: 1,
    fontFamily: 'VT323_400Regular',
  },
  helpPanel: {
    marginTop: 0,
    padding: 12,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
    width: '92%',
  },
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
  helpTitle: {
    color: '#9FEA8F',
    fontSize: 18,
    fontFamily: 'VT323_400Regular',
    marginBottom: 8,
    textAlign: 'center',
  },
  helpText: {
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    marginBottom: 4,
  },
  downloadPanel: {
    marginTop: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
    width: '92%',
    alignSelf: 'center',
  },
  downloadText: {
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    marginBottom: 10,
    textAlign: 'center',
  },
  downloadBtns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
});

// Heatmap helpers
const generateDays = (weeks = 12) => {
  const days = [];
  const today = new Date();
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
};
const colorFor = (count, max) => {
  if (!count) return '#2B2B2B';
  if (count >= 4) return '#93c47d';
  if (count === 3) return '#6aa84f';
  if (count === 2) return '#38761d';
  return '#274e13';
};
const HistoryHeatmap = ({ history, weeks = 12 }) => {
  const days = generateDays(weeks);
  const max = days.reduce((m, d) => {
    const key = d.toISOString().slice(0, 10);
    return Math.max(m, history[key] || 0);
  }, 0);
  const columns = [];
  for (let i = 0; i < days.length; i += 7) columns.push(days.slice(i, i + 7));
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = columns.map((week) => {
    const firstOfMonth = week.find((d) => d.getDate() === 1);
    return firstOfMonth ? monthNames[firstOfMonth.getMonth()] : '';
  });
  return (
    <View style={{ flexDirection: 'column', marginTop: 8 }}>
      <View style={{ flexDirection: 'row' }}>
        {columns.map((week, wi) => (
          <View key={wi} style={{ marginRight: 3 }}>
            {week.map((d, di) => {
              const key = d.toISOString().slice(0, 10);
              const count = history[key] || 0;
              return (
                <View key={di} style={{ width: 10, height: 10, marginBottom: 2, borderRadius: 2, backgroundColor: colorFor(count, max) }} />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {monthLabels.map((label, i) => (
          <Text key={i} style={{ width: 13, color: '#5F7F5F', fontSize: 10, fontFamily: 'VT323_400Regular' }}>{label}</Text>
        ))}
      </View>
    </View>
  );
};
