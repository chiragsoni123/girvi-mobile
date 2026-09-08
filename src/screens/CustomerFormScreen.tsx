import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { PhotoStrip } from '../components/PhotoStrip';
import { useToast } from '../components/Toast';
import {
  AppBar,
  Button,
  Card,
  ChipGroup,
  ErrorBanner,
  Field,
  Screen,
  SectionTitle,
} from '../components/ui';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { AppNav, AppStackParamList } from '../navigation/types';
import * as api from '../services/api';
import { Customer } from '../types/girvi';

const ID_TYPES: Customer['idProofType'][] = [
  'Aadhar Card',
  'PAN Card',
  'Voter ID',
  'Driving License',
  'Ration Card',
  'Other',
];

export const CustomerFormScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'CustomerForm'>>();
  const { customerById, store, refresh } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const existing = route.params?.customerId ? customerById(route.params.customerId) : undefined;

  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [relativeName, setRelativeName] = useState(existing?.relativeName ?? '');
  const [relationType, setRelationType] = useState<Customer['relationType']>(
    existing?.relationType ?? 'S/O'
  );
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [alternatePhone, setAlternatePhone] = useState(existing?.alternatePhone ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? store?.city ?? '');
  const [pincode, setPincode] = useState(existing?.pincode ?? '');
  const [idProofType, setIdProofType] = useState<Customer['idProofType']>(
    existing?.idProofType ?? 'Aadhar Card'
  );
  const [idProofNumber, setIdProofNumber] = useState(existing?.idProofNumber ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photoPaths, setPhotoPaths] = useState<string[]>(
    existing?.photoUrl ? [existing.photoUrl] : []
  );
  const [idPhotoPaths, setIdPhotoPaths] = useState<string[]>(
    existing?.idProofPhotoUrl ? [existing.idProofPhotoUrl] : []
  );

  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!store) return 'Shop details are still loading. Please wait a moment.';
    if (!fullName.trim()) return "Enter the customer's full name.";
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return 'Enter a valid 10-digit phone number.';
    if (digits.length > 13) return 'That phone number has too many digits.';
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      return 'An Indian pincode is 6 digits.';
    }
    if (idProofType === 'Aadhar Card' && idProofNumber.trim()) {
      const aadhaar = idProofNumber.replace(/\D/g, '');
      if (aadhaar.length !== 12) return 'An Aadhaar number is 12 digits.';
    }
    if (idProofType === 'PAN Card' && idProofNumber.trim()) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/i.test(idProofNumber.trim())) {
        return 'A PAN looks like ABCDE1234F.';
      }
    }
    return null;
  };

  const save = useAsyncAction(async () => {
    const activeStore = store!;
    const payload: Partial<Customer> = {
      storeId: activeStore.id,
      fullName: fullName.trim(),
      relativeName: relativeName.trim(),
      relationType,
      phone: phone.trim(),
      alternatePhone: alternatePhone.trim(),
      address: address.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      idProofType,
      idProofNumber: idProofNumber.trim(),
      notes: notes.trim(),
      photoUrl: photoPaths[0] ?? null,
      idProofPhotoUrl: idPhotoPaths[0] ?? null,
    };

    if (existing) {
      await api.updateCustomer(existing.id, payload);
    } else {
      payload.customerCode = await api.nextCustomerCode(activeStore.id, activeStore.customerPrefix);
      await api.createCustomer(payload);
    }

    await refresh();
    toast.showSuccess(existing ? 'Customer updated.' : `${fullName.trim()} added.`);
    navigation.goBack();
  }, { context: 'CustomerForm.save' });

  const handleSave = () => {
    const problem = validate();
    setValidationError(problem);
    if (problem) return;
    if (!isOnline) {
      toast.showError({ message: 'Network request failed' });
      return;
    }
    void save.run();
  };

  return (
    <>
      <AppBar
        title={existing ? 'Edit customer' : 'New customer'}
        subtitle="KYC details kept for the shop's records"
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <ErrorBanner message={validationError} />
        <ErrorBanner message={save.error} onRetry={() => void save.run()} />

        <SectionTitle title="Identity" />
        <Card>
          <Field
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Rameshwar Sharma"
          />

          <ChipGroup<Customer['relationType']>
            label="Relation"
            columns={4}
            value={relationType}
            onChange={setRelationType}
            options={[
              { value: 'S/O', label: 'S/O' },
              { value: 'D/O', label: 'D/O' },
              { value: 'W/O', label: 'W/O' },
              { value: 'C/O', label: 'C/O' },
            ]}
          />

          <Field
            label="Father / husband / guardian name"
            value={relativeName}
            onChangeText={setRelativeName}
            placeholder="e.g. Gopal Lal Sharma"
          />

          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="9829011223"
          />

          <Field
            label="Alternate phone (optional)"
            value={alternatePhone}
            onChangeText={setAlternatePhone}
            keyboardType="phone-pad"
          />
        </Card>

        <SectionTitle title="Address" />
        <Card>
          <Field
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="House / street / area"
            multiline
          />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" />
        </Card>

        <SectionTitle title="ID proof" />
        <Card>
          <ChipGroup<Customer['idProofType']>
            label="Document type"
            columns={2}
            value={idProofType}
            onChange={setIdProofType}
            options={ID_TYPES.map((type) => ({ value: type, label: type }))}
          />
          <Field
            label="Document number"
            value={idProofNumber}
            onChangeText={setIdProofNumber}
            placeholder="e.g. 4589 1234 7890"
            autoCapitalize="characters"
          />

          {store && (
            <>
              <PhotoStrip
                storeId={store.id}
                folder="kyc"
                paths={photoPaths}
                onChange={setPhotoPaths}
                max={1}
                label="Customer photo"
              />
              <PhotoStrip
                storeId={store.id}
                folder="kyc"
                paths={idPhotoPaths}
                onChange={setIdPhotoPaths}
                max={1}
                label="ID document photo"
              />
            </>
          )}

          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. regular customer since 2021"
            multiline
          />
        </Card>

        <Button
          title={save.busy ? 'Saving…' : existing ? 'Save changes' : 'Save customer'}
          onPress={handleSave}
          loading={save.busy}
          disabled={!isOnline}
        />
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
});
