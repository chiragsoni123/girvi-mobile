import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { neutral, radius, spacing } from '../theme';
import { formatDate } from '../utils/format';
import { parseDay, toDayString } from '../utils/dates';

export const DateField: React.FC<{
  label: string;
  value: string;
  onChange: (next: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  hint?: string;
}> = ({ label, value, onChange, minimumDate, maximumDate, hint }) => {
  const [iosOpen, setIosOpen] = useState(false);

  const current = value ? parseDay(value) : new Date();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: minimumDate ? parseDay(minimumDate) : undefined,
        maximumDate: maximumDate ? parseDay(maximumDate) : undefined,
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            onChange(
              toDayString(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())))
            );
          }
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} style={styles.box}>
        <Text style={styles.value}>{value ? formatDate(value) : 'Select a date'}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}

      {Platform.OS === 'ios' && iosOpen && (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          minimumDate={minimumDate ? parseDay(minimumDate) : undefined}
          maximumDate={maximumDate ? parseDay(maximumDate) : undefined}
          onChange={(event, date) => {
            setIosOpen(false);
            if (date) {
              onChange(
                toDayString(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())))
              );
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: '700', color: neutral[600], marginBottom: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: neutral[300],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  value: { fontSize: 14, fontWeight: '700', color: neutral[900] },
  chevron: { fontSize: 14, color: neutral[400] },
  hint: { fontSize: 10.5, color: neutral[400], marginTop: 4 },
});
