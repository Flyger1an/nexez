import { Redirect } from 'expo-router'

// The center tab's FAB pushes /listing/create directly; this route only renders
// if reached some other way, in which case it redirects to the create editor.
export default function CreateTabRoute() {
  return <Redirect href="/listing/create" />
}
