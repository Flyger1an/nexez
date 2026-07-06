import { Link, Stack } from 'expo-router'
import { Text } from 'react-native'
import { Card, Screen } from '@/src/components/ui'
import { colors } from '@/src/theme/colors'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <Screen>
        <Card>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Screen not found</Text>
          <Link href="/">
            <Text style={{ color: colors.teal, fontWeight: '800' }}>Return to Seller Hub</Text>
          </Link>
        </Card>
      </Screen>
    </>
  )
}
