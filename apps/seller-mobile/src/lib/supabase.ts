import 'react-native-url-polyfill/auto'
import 'react-native-get-random-values'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import * as aesjs from 'aes-js'
import { Platform } from 'react-native'
import { config, isSupabaseConfigured } from './config'

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

class LargeSecureStore {
  private encryptionKeyName(key: string) {
    // expo-secure-store only allows [A-Za-z0-9._-] in keys. Supabase's storage key
    // (e.g. "sb-<ref>-auth-token") is safe, but a ":" separator is NOT - it throws
    // "Invalid key provided to SecureStore". Use "." and sanitize anything unexpected.
    return `${key}.aes-key`.replace(/[^A-Za-z0-9._-]/g, '_')
  }

  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8))
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1))
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value))

    await SecureStore.setItemAsync(
      this.encryptionKeyName(key),
      aesjs.utils.hex.fromBytes(encryptionKey),
      secureStoreOptions,
    )

    return aesjs.utils.hex.fromBytes(encryptedBytes)
  }

  private async decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(this.encryptionKeyName(key), secureStoreOptions)
    if (!encryptionKeyHex) return null

    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1))
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value))
    return aesjs.utils.utf8.fromBytes(decryptedBytes)
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key)
    if (!encrypted) return encrypted
    return this.decrypt(key, encrypted)
  }

  async setItem(key: string, value: string) {
    const encrypted = await this.encrypt(key, value)
    await AsyncStorage.setItem(key, encrypted)
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key)
    await SecureStore.deleteItemAsync(this.encryptionKeyName(key), secureStoreOptions)
  }
}

class MemoryStorage {
  private values = new Map<string, string>()

  async getItem(key: string) {
    return this.values.get(key) ?? null
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  async removeItem(key: string) {
    this.values.delete(key)
  }
}

const authStorage = typeof window === 'undefined'
  ? new MemoryStorage()
  : Platform.OS === 'web'
    ? AsyncStorage
    : new LargeSecureStore()

export { isSupabaseConfigured }

export const supabase = createClient(
  config.supabaseUrl || 'https://example.supabase.co',
  config.supabasePublishableKey || 'missing-publishable-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'nexez-seller-mobile',
      },
    },
  },
)
