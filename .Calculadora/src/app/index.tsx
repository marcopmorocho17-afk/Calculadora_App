import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

type Operator = '+' | '−' | '×' | '÷';
type KeyVariant = 'number' | 'utility' | 'operator' | 'equals';

const rows: { label: string; variant: KeyVariant }[][] = [
  [
    { label: 'AC', variant: 'utility' },
    { label: '+/−', variant: 'utility' },
    { label: '%', variant: 'utility' },
    { label: '÷', variant: 'operator' },
  ],
  [
    { label: '7', variant: 'number' },
    { label: '8', variant: 'number' },
    { label: '9', variant: 'number' },
    { label: '×', variant: 'operator' },
  ],
  [
    { label: '4', variant: 'number' },
    { label: '5', variant: 'number' },
    { label: '6', variant: 'number' },
    { label: '−', variant: 'operator' },
  ],
  [
    { label: '1', variant: 'number' },
    { label: '2', variant: 'number' },
    { label: '3', variant: 'number' },
    { label: '+', variant: 'operator' },
  ],
];

function cleanNumber(value: number): string {
  return String(Number(value.toPrecision(10)));
}

function formatNumber(value: string): string {
  if (value === 'Error') return value;
  const [integer, decimal] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

function calculate(left: number, right: number, operator: Operator): number | null {
  switch (operator) {
    case '+':
      return left + right;
    case '−':
      return left - right;
    case '×':
      return left * right;
    case '÷':
      return right === 0 ? null : left / right;
  }
}

function CalculatorKey({
  label,
  variant,
  wide = false,
  onPress,
}: {
  label: string;
  variant: KeyVariant;
  wide?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+/−' ? 'Cambiar signo' : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        styles[variant],
        wide && styles.wideKey,
        pressed && styles.keyPressed,
      ]}>
      <Text style={[styles.keyLabel, variant === 'utility' && styles.utilityLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Index() {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [newEntry, setNewEntry] = useState(false);
  const [percentageSelected, setPercentageSelected] = useState(false);

  function reset() {
    setDisplay('0');
    setExpression('');
    setFirstOperand(null);
    setOperator(null);
    setNewEntry(false);
    setPercentageSelected(false);
  }

  function enterDigit(digit: string) {
    if (display === 'Error' || newEntry) {
      setDisplay(digit);
      setNewEntry(false);
    } else {
      setDisplay((value) => (value === '0' ? digit : value + digit));
    }
  }

  function enterDecimal() {
    if (display === 'Error' || newEntry) {
      setDisplay('0.');
      setNewEntry(false);
    } else if (!display.includes('.')) {
      setDisplay((value) => `${value}.`);
    }
  }

  function chooseOperator(nextOperator: Operator) {
    const currentValue = display === 'Error' ? 0 : Number(display);
    let value = currentValue;

    if (operator && firstOperand !== null && !newEntry) {
      const result = calculate(firstOperand, currentValue, operator);
      if (result === null) {
        setDisplay('Error');
        setExpression('No se puede dividir entre cero');
        setFirstOperand(null);
        setOperator(null);
        setNewEntry(true);
        setPercentageSelected(false);
        return;
      }
      value = result;
      setDisplay(cleanNumber(result));
    }

    setFirstOperand(value);
    setOperator(nextOperator);
    setExpression(`${formatNumber(cleanNumber(value))} ${nextOperator}`);
    setNewEntry(true);
    setPercentageSelected(false);
  }

  function showResult() {
    if (operator === null || firstOperand === null) return;

    const rightOperand = Number(display);
    const actualRightOperand = percentageSelected
      ? operator === '+' || operator === '−'
        ? (firstOperand * rightOperand) / 100
        : rightOperand / 100
      : rightOperand;
    const result = calculate(firstOperand, actualRightOperand, operator);

    if (result === null) {
      setDisplay('Error');
      setExpression(`${formatNumber(cleanNumber(firstOperand))} ÷ 0`);
    } else {
      const percent = percentageSelected ? '%' : '';
      setDisplay(cleanNumber(result));
      setExpression(
        `${formatNumber(cleanNumber(firstOperand))} ${operator} ${formatNumber(cleanNumber(rightOperand))}${percent} =`,
      );
    }

    setFirstOperand(null);
    setOperator(null);
    setNewEntry(true);
    setPercentageSelected(false);
  }

  function pressKey(label: string) {
    if (/^\d$/.test(label)) {
      enterDigit(label);
    } else if (label === '.') {
      enterDecimal();
    } else if (label === 'AC') {
      reset();
    } else if (label === '+/−') {
      if (display !== 'Error' && newEntry) {
        setDisplay('-0');
        setNewEntry(false);
      } else if (display !== 'Error' && Number(display) !== 0) {
        setDisplay((value) => (value.startsWith('-') ? value.slice(1) : `-${value}`));
      }
    } else if (label === '%') {
      if (display === 'Error') return;
      if (operator && firstOperand !== null) {
        setPercentageSelected(true);
        setExpression(
          `${formatNumber(cleanNumber(firstOperand))} ${operator} ${formatNumber(display)}%`,
        );
      } else {
        setExpression(`${formatNumber(display)}%`);
        setDisplay(cleanNumber(Number(display) / 100));
      }
      setNewEntry(false);
    } else if (label === '=') {
      showResult();
    } else if (label === '+' || label === '−' || label === '×' || label === '÷') {
      chooseOperator(label);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>+</Text>
            </View>
            <View>
              <Text style={styles.brandName}>NÚMERO</Text>
              <Text style={styles.brandCaption}>CALCULADORA</Text>
            </View>
          </View>
          <View style={styles.modePill}>
            <View style={styles.modeDot} />
            <Text style={styles.modeText}>ESTÁNDAR</Text>
          </View>
        </View>

        <View style={styles.displayPanel}>
          <View style={styles.displayTopRow}>
            <Text style={styles.displayCaption}>RESULTADO</Text>
            <View style={styles.menuDots}>
              <View style={styles.menuDot} />
              <View style={styles.menuDot} />
              <View style={styles.menuDot} />
            </View>
          </View>
          <View style={styles.resultBlock}>
            <Text numberOfLines={1} style={styles.expression}>
              {expression || ' '}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.result}>
              {formatNumber(display)}
            </Text>
          </View>
          <View style={styles.displayFooter}>
            <View style={[styles.readyIndicator, display === 'Error' && styles.errorIndicator]} />
            <Text style={styles.displayFooterText}>
              {display === 'Error' ? 'Revisa la operación' : 'Listo para calcular'}
            </Text>
            <Text style={styles.memoryLabel}>M · 0</Text>
          </View>
        </View>

        <View style={styles.keypad}>
          {rows.map((row, rowIndex) => (
            <View style={styles.keyRow} key={`row-${rowIndex}`}>
              {row.map((key) => (
                <CalculatorKey
                  key={key.label}
                  label={key.label}
                  variant={key.variant}
                  onPress={() => pressKey(key.label)}
                />
              ))}
            </View>
          ))}
          <View style={styles.keyRow}>
            <CalculatorKey
              label="0"
              variant="number"
              wide
              onPress={() => enterDigit('0')}
            />
            <CalculatorKey label="." variant="number" onPress={enterDecimal} />
            <CalculatorKey label="=" variant="equals" onPress={showResult} />
          </View>
        </View>

        <View style={styles.bottomNote}>
          <View style={styles.noteLine} />
          <Text style={styles.noteText}>SIMPLE. CLARA. PRECISA.</Text>
          <View style={styles.noteLine} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#101815',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#B8F36B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#152117',
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 30,
  },
  brandName: {
    color: '#F5F7F3',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  brandCaption: {
    color: '#78857D',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.7,
    marginTop: 3,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A2420',
    borderWidth: 1,
    borderColor: '#29342F',
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B8F36B',
  },
  modeText: {
    color: '#B9C3BC',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  displayPanel: {
    flex: 1,
    minHeight: 156,
    maxHeight: 260,
    justifyContent: 'space-between',
    padding: 20,
    marginBottom: 18,
    borderRadius: 25,
    backgroundColor: '#19241F',
    borderWidth: 1,
    borderColor: '#29362F',
  },
  displayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayCaption: {
    color: '#819087',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  menuDots: {
    flexDirection: 'row',
    gap: 3,
    padding: 7,
  },
  menuDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#718078',
  },
  resultBlock: {
    alignItems: 'flex-end',
    marginVertical: 12,
  },
  expression: {
    minHeight: 20,
    width: '100%',
    color: '#8B9890',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 5,
    textAlign: 'right',
  },
  result: {
    width: '100%',
    color: '#F4F7F2',
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: -2,
    textAlign: 'right',
  },
  displayFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readyIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B8F36B',
    marginRight: 7,
  },
  errorIndicator: {
    backgroundColor: '#F18E79',
  },
  displayFooterText: {
    color: '#89968E',
    fontSize: 10,
  },
  memoryLabel: {
    color: '#89968E',
    fontSize: 10,
    marginLeft: 'auto',
    letterSpacing: 0.5,
  },
  keypad: {
    flex: 1,
    gap: 10,
  },
  keyRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
  },
  wideKey: {
    flex: 2,
    alignItems: 'flex-start',
    paddingLeft: 26,
  },
  keyPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  number: {
    backgroundColor: '#1A2420',
    borderColor: '#27332D',
  },
  utility: {
    backgroundColor: '#26322C',
    borderColor: '#344139',
  },
  operator: {
    backgroundColor: '#25352B',
    borderColor: '#35483A',
  },
  equals: {
    backgroundColor: '#B8F36B',
    borderColor: '#B8F36B',
  },
  keyLabel: {
    color: '#F2F5F0',
    fontSize: 21,
    fontWeight: '500',
  },
  utilityLabel: {
    color: '#B9C5BD',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomNote: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  noteLine: {
    width: 23,
    height: 1,
    backgroundColor: '#344139',
  },
  noteText: {
    color: '#738078',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
});
