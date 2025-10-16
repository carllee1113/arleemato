import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Pressable, Platform, TextInput } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts, VT323_400Regular } from '@expo-google-fonts/vt323';
 

const DEFAULT_WORK_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;

const STATES = {
  WORK: 'WORK',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK: 'LONG_BREAK',
  PAUSED: 'PAUSED',
};

export default function App() {
  const [fontsLoaded] = useFonts({
    VT323_400Regular,
    DSEG7ClassicBoldItalic: require('./assets/fonts/DSEG7Classic-BoldItalic.ttf'),
  });
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

  useEffect(() => {
    if (remaining === 0) {
      if (state === STATES.WORK) {
        const nextCycles = completedCycles + 1;
        setCompletedCycles(nextCycles);
        if (nextCycles < totalSessions) {
          setState(STATES.SHORT_BREAK);
          setRemaining(restSeconds);
          setRunning(true);
        } else {
          // All sessions completed: pause and show Restart option
          setRunning(false);
          setPlanCompleted(true);
          setState(STATES.PAUSED);
          setRemaining(focusSeconds);
        }
      } else if (state === STATES.SHORT_BREAK) {
        setState(STATES.WORK);
        setRemaining(focusSeconds);
        setRunning(true);
      }
    }
  }, [remaining, state, completedCycles, totalSessions, focusSeconds, restSeconds]);

  const handlePrimaryPress = () => {
    if (!hasStarted) {
      setHasStarted(true);
      setShowPlan(false);
      setState(STATES.WORK);
      setRemaining(focusSeconds);
      setRunning(true);
      setPlanCompleted(false);
      return;
    }
    if (planCompleted) {
      // Restart scheduled sessions
      setCompletedCycles(0);
      setState(STATES.WORK);
      setRemaining(focusSeconds);
      setRunning(true);
      setPlanCompleted(false);
    } else {
      setRunning((r) => !r);
    }
  };

  const [showPlan, setShowPlan] = useState(false);
  const [planSessions, setPlanSessions] = useState(totalSessions);
  const [planFocusMins, setPlanFocusMins] = useState(Math.floor(focusSeconds / 60));
  const [planRestMins, setPlanRestMins] = useState(Math.floor(restSeconds / 60));
  const [noteMode, setNoteMode] = useState(null); // 'NOTE' | 'DO_LATER' | 'IDEA' | null
  const [noteText, setNoteText] = useState('');

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const openNote = (mode) => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const label = mode === 'NOTE' ? 'Note' : mode === 'DO_LATER' ? 'Do Later' : 'Idea';
    if (noteMode === mode) {
      setNoteMode(null);
    } else {
      setNoteMode(mode);
      setNoteText(`${dateStr} ${timeStr} ${label}: `);
    }
    // Pressing notes pauses the clock and switches primary label to Resume
    setRunning(false);
    setPlanCompleted(false);
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
    if (startNow) { setShowPlan(false); setHasStarted(true); setPlanCompleted(false); }
  };

  const passCurrentSession = () => {
    const continueRunning = running;
    if (state === STATES.WORK) {
      const nextCycles = completedCycles + 1;
      setCompletedCycles(nextCycles);
      if (nextCycles < totalSessions) {
        setState(STATES.SHORT_BREAK);
        setRemaining(restSeconds);
        setRunning(continueRunning);
      } else {
        // End of cycle: pause and enable Restart
        setRunning(false);
        setPlanCompleted(true);
        setState(STATES.PAUSED);
        setRemaining(focusSeconds);
      }
    } else if (state === STATES.SHORT_BREAK || state === STATES.LONG_BREAK) {
      setState(STATES.WORK);
      setRemaining(focusSeconds);
      setRunning(continueRunning);
    }
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
      let h = d.getHours() % 12 || 12; // 12-hour style like the reference
      const mm = String(d.getMinutes()).padStart(2, '0');
      setNowStr(`${h}:${mm}`);
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
            <View />
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
            <Text style={styles.bottomLabel}>aleemato</Text>
          </View>
        </View>

        {showPlan && (
          <View style={styles.planPanel}>
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
            <View style={styles.planActions}>
              <Pressable onPress={() => applyPlan(true)} style={styles.button}>
                <Text style={styles.buttonText}>START</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!showPlan && (
          <View style={styles.controls}>
            <Pressable onPress={handlePrimaryPress} style={styles.button}>
              <Text style={styles.buttonText}>{!hasStarted ? 'START' : planCompleted ? 'RESTART' : running ? 'PAUSE' : 'RESUME'}</Text>
            </Pressable>
            <Pressable onPress={() => (hasStarted ? passCurrentSession() : setShowPlan((v) => !v))} style={styles.buttonSecondary}>
              <Text style={styles.buttonText}>{hasStarted ? 'PASS' : 'PLAN'}</Text>
            </Pressable>
          </View>
        )}

        {/* Notes / Do Later / Idea quick input bar */}
        <View style={styles.noteBar}>
          <Pressable style={styles.noteBtn} onPress={() => openNote('NOTE')}>
            <Text style={styles.buttonText}>NOTES</Text>
          </Pressable>
          <Pressable style={styles.noteBtn} onPress={() => openNote('DO_LATER')}>
            <Text style={styles.buttonText}>DO LATER</Text>
          </Pressable>
          <Pressable style={styles.noteBtn} onPress={() => openNote('IDEA')}>
            <Text style={styles.buttonText}>IDEA</Text>
          </Pressable>
        </View>

        {noteMode && (
          <View style={styles.noteInputPanel}>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              multiline
              style={styles.noteInput}
              placeholder="Type here…"
              placeholderTextColor="#5F7F5F"
            />
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
    backgroundColor: '#111411',
  },
  buttonSecondary: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#334033',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0F120F',
  },
  buttonText: {
    color: '#9FEA8F',
    letterSpacing: 1.5,
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
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
    backgroundColor: '#0F120F',
  },
  noteInputPanel: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#334033',
    backgroundColor: '#0F120F',
    borderRadius: 8,
  },
  noteInput: {
    minHeight: 80,
    color: '#9FEA8F',
    fontSize: 16,
    fontFamily: 'VT323_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
