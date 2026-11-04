import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage, getSavedServerUrl, normalizeUrl, setServerUrl } from '../src/lib/pb';
import { useStore } from '../src/lib/store';
import { Button, Divider, Field, Group, Screen } from '../src/ui/components';
import { space, type, useTheme } from '../src/ui/theme';

export default function Login() {
  const t = useTheme();
  const { onLoggedIn } = useStore();
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSavedServerUrl().then((u) => u && setServer(u));
  }, []);

  const submit = async () => {
    if (!server || !email || !password) return Alert.alert('Bitte Server, E-Mail und Passwort ausfüllen.');
    if (register && password.length < 10) return Alert.alert('Das Passwort braucht mindestens 10 Zeichen.');
    setBusy(true);
    try {
      const pb = await setServerUrl(server);
      try {
        await pb.health.check();
      } catch {
        throw new Error(`Unter ${normalizeUrl(server)} antwortet kein FamilyCal-Server.`);
      }
      if (register) {
        await pb.collection('users').create({
          email: email.trim(),
          password,
          passwordConfirm: password,
          name: name.trim(),
        });
      }
      await pb.collection('users').authWithPassword(email.trim(), password);
      await onLoggedIn();
      router.replace('/');
    } catch (e: any) {
      Alert.alert(register ? 'Registrierung fehlgeschlagen' : 'Anmeldung fehlgeschlagen', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <View style={{ marginTop: 32, marginBottom: 8, gap: 6 }}>
            <Text style={[type.dayHero, { color: t.ink }]}>FamilyCal</Text>
            <Text style={[type.body, { color: t.muted }]}>Die Termine eurer Familie an einem Ort.</Text>
          </View>

          <Group title="Server" footer="Die Adresse deines eigenen FamilyCal-Servers, z. B. kalender.example.de">
            <Field
              value={server}
              onChangeText={setServer}
              placeholder="kalender.example.de"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Group>

          <Group title={register ? 'Neues Konto' : 'Konto'}>
            {register ? (
              <>
                <Field value={name} onChangeText={setName} placeholder="Dein Name" textContentType="name" />
                <Divider />
              </>
            ) : null}
            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
            />
            <Divider />
            <Field
              value={password}
              onChangeText={setPassword}
              placeholder={register ? 'Passwort (min. 10 Zeichen)' : 'Passwort'}
              secureTextEntry
              textContentType={register ? 'newPassword' : 'password'}
              onSubmitEditing={submit}
            />
          </Group>

          <Button title={register ? 'Konto erstellen' : 'Anmelden'} onPress={submit} loading={busy} />
          <Pressable onPress={() => setRegister(!register)} style={{ alignItems: 'center', padding: space.m }}>
            <Text style={[type.body, { color: t.accent }]}>{register ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen'}</Text>
          </Pressable>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
