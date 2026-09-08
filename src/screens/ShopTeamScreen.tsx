import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBar, Card, EmptyState, ErrorState, InfoBanner, Loading, Row, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { AppError, logError, toAppError } from '../lib/errors';
import { AppNav } from '../navigation/types';
import * as api from '../services/api';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { StoreMember } from '../types/girvi';
import { formatDate } from '../utils/format';

export const ShopTeamScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
  const { activeStore, user } = useAuth();

  const [members, setMembers] = useState<StoreMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const load = useCallback(async () => {
    if (!activeStore) return;
    setLoading(true);
    setError(null);
    try {
      setMembers(await api.fetchStoreMembers(activeStore.id));
    } catch (err) {
      logError('ShopTeam.load', err);
      setError(toAppError(err));
    } finally {
      setLoading(false);
    }
  }, [activeStore]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <AppBar
        title="Shop team"
        subtitle={`${members.length} people can open this ledger`}
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : members.length === 0 ? (
          <EmptyState title="No team members yet" />
        ) : (
          <>
          <InfoBanner message="Anyone who registers with your store code appears here. Owners can change shop settings and delete records; staff can record pledges and payments." />
          {members.map((member) => (
            <Card key={member.userId}>
              <Row style={{ alignItems: 'center' }} gap={spacing.md}>
                <View style={[styles.avatar, { backgroundColor: accent.soft }]}>
                  <Text style={[styles.avatarText, { color: accent.softText }]}>
                    {(member.fullName || member.email || '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {member.fullName || member.email}
                    {member.userId === user?.id ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.meta}>{member.email}</Text>
                  <Text style={styles.meta}>Joined {formatDate(member.createdAt)}</Text>
                </View>
                <View style={[styles.roleChip, { backgroundColor: accent.soft }]}>
                  <Text style={[styles.roleText, { color: accent.softText }]}>{member.role}</Text>
                </View>
              </Row>
            </Card>
          ))}
          </>
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  name: { fontSize: 13.5, fontWeight: '800', color: neutral[900] },
  meta: { fontSize: 11, color: neutral[500], marginTop: 1 },
  roleChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  roleText: { fontSize: 9.5, fontWeight: '800' },
});
