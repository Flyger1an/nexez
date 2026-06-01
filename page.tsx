import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

type Todo = {
  id: string | number
  name: string
}

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos } = await supabase.from('todos').select().returns<Todo[]>()

  return (
    <ul>
      {todos?.map((todo: Todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
