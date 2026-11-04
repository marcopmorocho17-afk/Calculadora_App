import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AngleMode = 'DEG' | 'RAD';
type PlotPoint = { x: number; y: number | null };
type HistoryEntry = { id: number; expression: string; result: string; angleMode: AngleMode };

const functionRows = [
  ['sin', 'cos', 'tan', 'x'],
  ['asin', 'acos', 'atan', 'pi'],
];

const keyRows = [
  ['AC', '(', ')', 'DEL'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['+/-', '0', '.', '+'],
  ['%', '^', 'pi', '='],
];

const graphExercises = [
  { label: 'x²', expression: 'x^2' },
  { label: '2x + 1', expression: '2*x+1' },
  { label: '1 / x', expression: '1/x' },
  { label: 'sin(x)', expression: 'sin(x)' },
  { label: 'cos(x)', expression: 'cos(x)' },
  { label: 'tan(x)', expression: 'tan(x)' },
];
const lastNumberPattern = /((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i;
const lexer = /\s*(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[a-z]+|[()+\-*/^])/iy;

function tokenize(expression: string) {
  const tokens: string[] = [];
  let position = 0;
  while (position < expression.length) {
    lexer.lastIndex = position;
    const match = lexer.exec(expression);
    if (!match) throw new Error('Invalid expression');
    tokens.push(match[1]);
    position = lexer.lastIndex;
  }
  if (tokens.length === 0) throw new Error('Empty expression');
  return tokens;
}

function evaluateExpression(expression: string, angleMode: AngleMode, xValue = 0) {
  const tokens = tokenize(expression);
  let position = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const next = parseTerm();
      value = operator === '+' ? value + next : value - next;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      const next = parseUnary();
      value = operator === '*' ? value * next : value / next;
    }
    return value;
  }

  function parseUnary(): number {
    const token = tokens[position];
    if (token === '+' || token === '-') {
      position += 1;
      const value = parseUnary();
      return token === '-' ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const value = parsePrimary();
    if (tokens[position] === '^') {
      position += 1;
      return value ** parseUnary();
    }
    return value;
  }

  function parsePrimary(): number {
    const token = tokens[position];
    if (!token) throw new Error('Unexpected end of expression');

    if (token === '(') {
      position += 1;
      const value = parseExpression();
      if (tokens[position] !== ')') throw new Error('Missing closing parenthesis');
      position += 1;
      return value;
    }

    if (/^(?:\d|\.)/.test(token)) {
      position += 1;
      return Number(token);
    }

    if (/^[a-z]+$/i.test(token)) {
      position += 1;
      const name = token.toLowerCase();
      if (name === 'x') return xValue;
      if (name === 'pi') return Math.PI;
      if (tokens[position] !== '(') throw new Error('Function needs parentheses');
      position += 1;
      const argument = parseExpression();
      if (tokens[position] !== ')') throw new Error('Missing closing parenthesis');
      position += 1;

      const radians = angleMode === 'DEG' ? (argument * Math.PI) / 180 : argument;
      const fromRadians = (value: number) => angleMode === 'DEG' ? (value * 180) / Math.PI : value;
      switch (name) {
        case 'sin': return Math.sin(radians);
        case 'cos': return Math.cos(radians);
        case 'tan': return Math.tan(radians);
        case 'asin':
        case 'arcsin': return fromRadians(Math.asin(argument));
        case 'acos':
        case 'arccos': return fromRadians(Math.acos(argument));
        case 'atan':
        case 'arctan': return fromRadians(Math.atan(argument));
        default: throw new Error('Unknown function');
      }
    }

    throw new Error('Unexpected token');
  }

  const result = parseExpression();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid result');
  return result;
}

function formatNumber(value: number) {
  if (Object.is(value, -0) || value === 0) return '0';
  return String(Number(value.toPrecision(12)));
}

function buttonFeedback() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function lastNumber(expression: string) {
  return expression.match(lastNumberPattern)?.[0] ?? null;
}

function lastAdditiveOperator(expression: string) {
  let depth = 0;
  let operatorIndex = -1;

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (depth === 0 && (character === '+' || character === '-')) {
      const previous = expression[index - 1];
      if (index > 0 && !/[eE]/.test(previous) && !/[+\-*/^(]/.test(previous)) {
        operatorIndex = index;
      }
    }
  }

  return operatorIndex;
}

function getGraphDomain(expression: string, angleMode: AngleMode): [number, number, string] {
  if (/^(?:asin|acos|arcsin|arccos)\(/i.test(expression)) return [-1, 1, '1'];
  if (/^(?:atan|arctan)\(/i.test(expression)) return [-10, 10, '10'];
  if (!/(?:sin|cos|tan)\(/i.test(expression)) return [-10, 10, '10'];
  if (angleMode === 'DEG') return [-360, 360, '360'];
  return [-2 * Math.PI, 2 * Math.PI, '2π'];
}

function GraphPlane({ expression, angleMode }: { expression: string; angleMode: AngleMode }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [minimum, maximum] = getGraphDomain(expression, angleMode);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const pointCount = 81;
  const points: PlotPoint[] = Array.from({ length: pointCount }, (_, index) => {
    const x = minimum + ((maximum - minimum) * index) / (pointCount - 1);
    try {
      return { x, y: evaluateExpression(expression, angleMode, x) };
    } catch {
      return { x, y: null };
    }
  });

  const segments = size.width > 0 && size.height > 0
    ? points.slice(1).flatMap((point, index) => {
      const previous = points[index];
      if (previous.y === null || point.y === null) return [];
      if (Math.abs(previous.y - point.y) > 4 || Math.abs(previous.y) > 5 || Math.abs(point.y) > 5) {
        return [];
      }

      const x1 = (index / (pointCount - 1)) * size.width;
      const x2 = ((index + 1) / (pointCount - 1)) * size.width;
      const y1 = size.height / 2 - (previous.y / 10) * size.height;
      const y2 = size.height / 2 - (point.y / 10) * size.height;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      return [{
        key: `segment-${index}`,
        left: (x1 + x2 - length) / 2,
        top: (y1 + y2 - 2) / 2,
        width: length,
        angle: Math.atan2(dy, dx),
      }];
    })
    : [];

  return (
    <View style={styles.graphPlane} onLayout={onLayout}>
      {[0.25, 0.75].map((position) => (
        <View key={`horizontal-${position}`} style={[styles.gridLine, { top: `${position * 100}%` }]} />
      ))}
      {[0.25, 0.75].map((position) => (
        <View key={`vertical-${position}`} style={[styles.gridLineVertical, { left: `${position * 100}%` }]} />
      ))}
      <View style={[styles.axisLine, { top: '50%' }]} />
      <View style={[styles.axisLineVertical, { left: '50%' }]} />
      {segments.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.graphSegment,
            {
              left: segment.left,
              top: segment.top,
              width: segment.width,
              transform: [{ rotate: `${segment.angle}rad` }],
            },
          ]}
        />
      ))}
      {size.width > 0 && segments.length === 0 && (
        <Text style={styles.graphEmpty}>No se puede graficar este intervalo</Text>
      )}
      <Text style={[styles.axisLabel, styles.axisLeft]}>−{maximum === Math.PI * 2 ? '2π' : maximum}</Text>
      <Text style={[styles.axisLabel, styles.axisCenter]}>0</Text>
      <Text style={[styles.axisLabel, styles.axisRight]}>{maximum === Math.PI * 2 ? '2π' : maximum}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const [expression, setExpression] = useState('0');
  const [preview, setPreview] = useState<string | null>('0');
  const [didEvaluate, setDidEvaluate] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [screenMode, setScreenMode] = useState<'calc' | 'graph' | 'history'>('calc');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < 760;
  const veryCompact = windowHeight < 680;
  const keyHeight = veryCompact ? 38 : compact ? 44 : 50;
  const functionKeyHeight = veryCompact ? 32 : compact ? 36 : 40;
  const displayHeight = veryCompact ? 116 : 132;
  const swipeResponder = useMemo(() => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) < 60) return;
        const modes = ['calc', 'graph', 'history'] as const;
        const currentIndex = modes.indexOf(screenMode);
        const nextIndex = Math.max(0, Math.min(modes.length - 1, currentIndex + (gesture.dx < 0 ? 1 : -1)));
        if (nextIndex === currentIndex) return;
        setScreenMode(modes[nextIndex]);
        buttonFeedback();
      },
    }), [screenMode]);

  function updateExpression(nextExpression: string) {
    setExpression(nextExpression);
    setDidEvaluate(false);
    try {
      setPreview(formatNumber(evaluateExpression(nextExpression, angleMode)));
    } catch {
      setPreview(null);
    }
  }

  function changeAngleMode(mode: AngleMode) {
    buttonFeedback();
    setAngleMode(mode);
    try {
      setPreview(formatNumber(evaluateExpression(expression, mode)));
    } catch {
      setPreview(null);
    }
  }

  function insertFunction(name: string) {
    let current = expression === 'Error' || didEvaluate ? '0' : expression;
    const hasValueAtEnd = /(?:\d|x|pi|\))$/i.test(current);
    const prefix = current === '0' ? '' : hasValueAtEnd ? '*' : '';
    if (current === '0') current = '';
    updateExpression(`${current}${prefix}${name}(`);
  }

  function pressKey(key: string) {
    buttonFeedback();
    if (key === 'AC') {
      setExpression('0');
      setPreview('0');
      setDidEvaluate(false);
      return;
    }

    if (key === '=') {
      try {
        const answer = formatNumber(evaluateExpression(expression, angleMode));
        setHistory((entries) => [
          { id: (entries[0]?.id ?? -1) + 1, expression, result: answer, angleMode },
          ...entries,
        ].slice(0, 40));
        setExpression(answer);
        setPreview(null);
        setDidEvaluate(true);
      } catch {
        setExpression('Error');
        setPreview(null);
        setDidEvaluate(true);
      }
      return;
    }

    const isOperator = ['+', '-', '*', '/', '^'].includes(key);
    const isDigitOrDecimal = /^\d$/.test(key) || key === '.';
    let current = expression === 'Error' ? '0' : expression;
    if (didEvaluate && isOperator) {
      current = expression;
    } else if (didEvaluate && (isDigitOrDecimal || key === '(' || key === 'pi')) {
      current = '0';
    }

    if (/^\d$/.test(key)) {
      const number = lastNumber(current);
      if (current === '0') current = key;
      else if (number === '0') current = `${current.slice(0, -1)}${key}`;
      else if (!number && /(?:x|pi|\))$/i.test(current)) current += `*${key}`;
      else if (!number || number.replace(/\D/g, '').length < 14) current += key;
      updateExpression(current);
      return;
    }

    if (key === '.') {
      const number = lastNumber(current);
      if (!number) current += /(?:x|pi|\))$/i.test(current) ? '*0.' : '0.';
      else if (!number.includes('.')) current += '.';
      updateExpression(current);
      return;
    }

    if (isOperator) {
      if (/[+\-*/^]$/.test(current)) current = current.slice(0, -1);
      updateExpression(`${current}${key}`);
      return;
    }

    if (key === 'DEL') {
      updateExpression(current.length > 1 ? current.slice(0, -1) : '0');
      return;
    }

    if (key === '%') {
      const number = lastNumber(current);
      if (number) {
        const additiveIndex = lastAdditiveOperator(current);
        let percentValue = Number(number) / 100;
        if (additiveIndex >= 0) {
          const base = evaluateExpression(current.slice(0, additiveIndex), angleMode);
          percentValue = (base * Number(number)) / 100;
        }
        updateExpression(`${current.slice(0, -number.length)}${formatNumber(percentValue)}`);
      }
      return;
    }

    if (key === '+/-') {
      const number = lastNumber(current);
      if (!number) return;
      const start = current.length - number.length;
      const signPosition = start - 1;
      const hasUnaryMinus = signPosition >= 0
        && current[signPosition] === '-'
        && (signPosition === 0 || /[+*/^(]/.test(current[signPosition - 1]));
      updateExpression(hasUnaryMinus
        ? `${current.slice(0, signPosition)}${current.slice(start)}`
        : `${current.slice(0, start)}-${current.slice(start)}`);
      return;
    }

    if (key === '(') {
      const hasValueAtEnd = /(?:\d|x|pi|\))$/i.test(current);
      updateExpression(`${current === '0' ? '' : current}${hasValueAtEnd ? '*' : ''}(`);
      return;
    }

    if (key === ')') {
      if (/[\d)x]$/i.test(current)) updateExpression(`${current})`);
      return;
    }

    if (key === 'x' || key === 'pi') {
      const hasValueAtEnd = /(?:\d|x|pi|\))$/i.test(current);
      updateExpression(`${current === '0' ? '' : current}${hasValueAtEnd ? '*' : ''}${key}`);
      return;
    }

    if (key === 'sin' || key === 'cos' || key === 'tan'
      || key === 'asin' || key === 'acos' || key === 'atan') {
      insertFunction(key);
    }
  }

  function selectGraphExercise(nextExpression: string) {
    buttonFeedback();
    updateExpression(nextExpression);
    setScreenMode('graph');
  }

  function selectScreenMode(mode: 'calc' | 'graph' | 'history') {
    buttonFeedback();
    setScreenMode(mode);
  }

  function clearHistory() {
    buttonFeedback();
    setHistory([]);
  }

  function restoreHistory(entry: HistoryEntry) {
    buttonFeedback();
    setExpression(entry.result);
    setPreview(entry.result);
    setAngleMode(entry.angleMode);
    setDidEvaluate(true);
    setScreenMode('calc');
  }

  const displayExpression = expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/pi/gi, 'π');
  const displayValue = preview ?? expression;
  const [, , graphRange] = getGraphDomain(expression, angleMode);
  const graphRangeLabel = `${graphRange}${angleMode === 'DEG' && /(?:^|[^a-z])(?:sin|cos|tan)\(/i.test(expression) ? '°' : ''}`;
  const keyLabels: Record<string, string> = {
    '/': '÷',
    '*': '×',
    '-': '−',
    '+/-': '±',
    asin: 'sin⁻¹',
    acos: 'cos⁻¹',
    atan: 'tan⁻¹',
    pi: 'π',
    DEL: '⌫',
  };
  const keyAccessibility: Record<string, string> = {
    AC: 'Borrar todo',
    DEL: 'Retroceso, borra el último carácter y conserva la operación',
    '%': 'Porcentaje',
    '+/-': 'Cambiar signo',
    '=': 'Calcular y vibrar',
    sin: 'Seno',
    cos: 'Coseno',
    tan: 'Tangente',
    asin: 'Arcoseno',
    acos: 'Arcocoseno',
    atan: 'Arcotangente',
    x: 'Variable x',
    pi: 'Pi',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark} />
          <Text style={styles.title}>Calculadora</Text>
          <View style={styles.angleSwitch}>
            {(['DEG', 'RAD'] as const).map((mode) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: angleMode === mode }}
                onPress={() => changeAngleMode(mode)}
                style={[styles.angleOption, angleMode === mode && styles.angleOptionSelected]}>
                <Text style={[styles.angleLabel, angleMode === mode && styles.angleLabelSelected]}>
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.display, { height: displayHeight }]} {...swipeResponder.panHandlers}>
          <View style={styles.expressionRow}>
            <Text style={styles.expression} numberOfLines={1} adjustsFontSizeToFit>
              {displayExpression}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={keyAccessibility.DEL}
              onPress={() => pressKey('DEL')}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressedKey]}>
              <Text style={styles.deleteLabel}>{keyLabels.DEL}</Text>
            </Pressable>
          </View>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
            {displayValue}
          </Text>
        </View>

        <View style={styles.screenSwitch}>
          {([
            ['calc', 'CÁLCULO'],
            ['graph', 'GRÁFICA'],
            ['history', 'HISTORIAL'],
          ] as const).map(([mode, label]) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: screenMode === mode }}
              onPress={() => selectScreenMode(mode)}
              style={[styles.screenOption, screenMode === mode && styles.screenOptionSelected]}>
              <Text style={[styles.screenLabel, screenMode === mode && styles.screenLabelSelected]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {screenMode === 'calc' ? (
          <View style={styles.calculatorContent}>
            <View style={styles.functionPad}>
              {functionRows.map((row) => (
                <View key={row.join('')} style={styles.functionRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={keyAccessibility[key] ?? key}
                      onPress={() => pressKey(key)}
                      style={({ pressed }) => [
                        styles.functionKey,
                        { height: functionKeyHeight },
                        pressed && styles.pressedKey,
                      ]}>
                      <Text style={styles.functionLabel}>{keyLabels[key] ?? key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.keypad}>
              {keyRows.map((row) => (
                <View key={row.join('')} style={styles.keyRow}>
                  {row.map((key) => {
                    const isOperator = ['/', '*', '-', '+', '^'].includes(key);
                    const isUtility = ['AC', '(', ')', 'DEL', '%', '+/-'].includes(key);
                    const isEquals = key === '=';
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityLabel={keyAccessibility[key] ?? keyLabels[key] ?? key}
                        onPress={() => pressKey(key)}
                        style={({ pressed }) => [
                          styles.key,
                          { height: keyHeight },
                          isUtility && styles.utilityKey,
                          isOperator && styles.operatorKey,
                          isEquals && styles.equalsKey,
                          pressed && styles.pressedKey,
                        ]}>
                        <Text style={[
                          styles.keyLabel,
                          isUtility && styles.utilityLabel,
                          isOperator && styles.operatorLabel,
                          isEquals && styles.equalsLabel,
                        ]}>
                          {keyLabels[key] ?? key}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        ) : screenMode === 'graph' ? (
          <View style={styles.graphPanel}>
            <Text style={styles.graphTitle}>y = {displayExpression}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.graphFunctions}>
              {graphExercises.map(({ label, expression: exercise }) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={`Graficar ${label}`}
                  onPress={() => selectGraphExercise(exercise)}
                  style={styles.graphFunctionButton}>
                  <Text style={styles.graphFunctionLabel}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <GraphPlane expression={expression} angleMode={angleMode} />
            <Text style={styles.graphHint}>
              x: −{graphRangeLabel} a {graphRangeLabel} · y: −5 a 5
            </Text>
          </View>
        ) : (
          <View style={styles.historyPanel}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Respuestas recientes</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Borrar historial"
                disabled={history.length === 0}
                onPress={clearHistory}
                style={({ pressed }) => [
                  styles.clearHistoryButton,
                  history.length === 0 && styles.clearHistoryDisabled,
                  pressed && styles.pressedKey,
                ]}>
                <Text style={styles.clearHistoryLabel}>Vaciar</Text>
              </Pressable>
            </View>
            {history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyTitle}>Aún no hay respuestas</Text>
                <Text style={styles.historyEmptyHint}>Los cálculos que confirmes con = aparecerán aquí.</Text>
              </View>
            ) : (
              <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>
                {history.map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar respuesta ${entry.result}`}
                    onPress={() => restoreHistory(entry)}
                    style={({ pressed }) => [styles.historyEntry, pressed && styles.pressedKey]}>
                    <View style={styles.historyMetaRow}>
                      <Text style={styles.historyExpression} numberOfLines={1}>
                        {entry.expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/pi/gi, 'π')}
                      </Text>
                      <Text style={styles.historyAngle}>{entry.angleMode}</Text>
                    </View>
                    <Text style={styles.historyResult} numberOfLines={1}>{entry.result}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F5EF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  header: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16806A',
  },
  title: {
    flex: 1,
    color: '#18251F',
    fontSize: 17,
    fontWeight: '700',
  },
  angleSwitch: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: 11,
    backgroundColor: '#E4EAE4',
  },
  angleOption: {
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  angleOptionSelected: {
    backgroundColor: '#FFFFFF',
  },
  angleLabel: {
    color: '#718078',
    fontSize: 11,
    fontWeight: '700',
  },
  angleLabelSelected: {
    color: '#176B56',
  },
  display: {
    flexShrink: 0,
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  expressionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  expression: {
    flexShrink: 1,
    color: '#88948D',
    fontSize: 22,
    textAlign: 'right',
  },
  deleteButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  deleteLabel: {
    color: '#88948D',
    fontSize: 22,
    fontWeight: '500',
  },
  value: {
    color: '#18251F',
    fontSize: 56,
    fontWeight: '300',
    lineHeight: 66,
    textAlign: 'right',
  },
  screenSwitch: {
    height: 42,
    flexDirection: 'row',
    gap: 6,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#E4EAE4',
  },
  screenOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  screenOptionSelected: {
    backgroundColor: '#FFFFFF',
  },
  screenLabel: {
    color: '#718078',
    fontSize: 11,
    fontWeight: '700',
  },
  screenLabelSelected: {
    color: '#176B56',
  },
  historyPanel: {
    flex: 1,
    minHeight: 0,
    paddingTop: 14,
  },
  historyHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  historyTitle: {
    color: '#18251F',
    fontSize: 17,
    fontWeight: '700',
  },
  clearHistoryButton: {
    minWidth: 54,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  clearHistoryDisabled: {
    opacity: 0.4,
  },
  clearHistoryLabel: {
    color: '#A4493D',
    fontSize: 12,
    fontWeight: '700',
  },
  historyScroll: {
    flex: 1,
  },
  historyList: {
    gap: 8,
    paddingBottom: 8,
  },
  historyEntry: {
    minHeight: 74,
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyExpression: {
    flex: 1,
    color: '#718078',
    fontSize: 13,
  },
  historyAngle: {
    color: '#16806A',
    fontSize: 10,
    fontWeight: '700',
  },
  historyResult: {
    color: '#18251F',
    fontSize: 21,
    fontWeight: '600',
  },
  historyEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  historyEmptyTitle: {
    color: '#18251F',
    fontSize: 16,
    fontWeight: '600',
  },
  historyEmptyHint: {
    color: '#718078',
    fontSize: 13,
    textAlign: 'center',
  },
  calculatorContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 10,
  },
  functionPad: {
    gap: 6,
  },
  functionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  functionKey: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#DDE8E1',
  },
  functionLabel: {
    color: '#176B56',
    fontSize: 13,
    fontWeight: '700',
  },
  keypad: {
    gap: 8,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  utilityKey: {
    backgroundColor: '#E4EAE4',
  },
  operatorKey: {
    backgroundColor: '#F0B44C',
  },
  equalsKey: {
    backgroundColor: '#176B56',
  },
  pressedKey: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
  keyLabel: {
    color: '#18251F',
    fontSize: 22,
    fontWeight: '500',
  },
  utilityLabel: {
    color: '#52625A',
    fontSize: 15,
    fontWeight: '700',
  },
  operatorLabel: {
    color: '#18251F',
    fontSize: 26,
    fontWeight: '500',
  },
  equalsLabel: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '600',
  },
  graphPanel: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
    gap: 12,
  },
  graphTitle: {
    color: '#18251F',
    fontSize: 17,
    fontWeight: '600',
  },
  graphFunctions: {
    gap: 8,
    paddingRight: 4,
  },
  graphFunctionButton: {
    minWidth: 68,
    height: 40,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#DDE8E1',
  },
  graphFunctionLabel: {
    color: '#176B56',
    fontSize: 12,
    fontWeight: '700',
  },
  graphPlane: {
    flex: 1,
    minHeight: 210,
    maxHeight: 360,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E9ECE7',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E9ECE7',
  },
  axisLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#9BA79F',
  },
  axisLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#9BA79F',
  },
  graphSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#16806A',
  },
  graphEmpty: {
    position: 'absolute',
    top: '48%',
    alignSelf: 'center',
    color: '#718078',
    fontSize: 13,
  },
  axisLabel: {
    position: 'absolute',
    bottom: 5,
    color: '#718078',
    fontSize: 10,
    backgroundColor: '#FFFFFF',
  },
  axisLeft: {
    left: 5,
  },
  axisCenter: {
    left: '50%',
    transform: [{ translateX: -3 }],
  },
  axisRight: {
    right: 5,
  },
  graphHint: {
    color: '#718078',
    fontSize: 11,
    textAlign: 'center',
  },
});
