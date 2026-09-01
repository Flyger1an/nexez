import {
  DELETE as platformDelete,
  GET as platformGet,
  POST as platformPost,
} from '../route'

export const maxDuration = 30

export async function GET() {
  return platformGet()
}

export async function DELETE() {
  return platformDelete()
}

export async function POST(request: Request) {
  return platformPost(request)
}
