import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { colors, fonts } from '@/src/theme/colors'

type ToastTone = 'default' | 'success' | 'danger'
type ToastState = { msg: string; tone: ToastTone } | null

const ToastCtx = createContext<(msg: string, tone?: ToastTone) => void>(() => {})

/** Fire a transient toast: `const toast = useToast(); toast('Saved', 'success')`. */
export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (msg: string, tone: ToastTone = 'default') => {
      setToast({ msg, tone })
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null))
      }, 2400)
    },
    [opacity],
  )

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={styles.toast}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: toast.tone === 'success' ? 'rgba(111,214,160,0.16)' : toast.tone === 'danger' ? 'rgba(255,140,130,0.16)' : 'rgba(255,255,255,0.1)' }]}
            />
            <View pointerEvents="none" style={styles.rim} />
            <Text style={[styles.text, { color: toast.tone === 'success' ? colors.success : toast.tone === 'danger' ? colors.danger : colors.text }]}>{toast.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, bottom: 104, zIndex: 80, alignItems: 'center' },
  toast: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  text: { fontFamily: fonts.bodyBold, fontSize: 13.5, textAlign: 'center' },
})
