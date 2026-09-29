import { AppError } from './workspaces'

export async function readJson(
  request: Pick<Request, 'headers' | 'body'>,
  maxBytes: number,
): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AppError(415, 'Expected JSON.')
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new AppError(413, 'Request is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new AppError(400, 'Invalid request.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new AppError(413, 'Request is too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new AppError(400, 'Invalid request.')
  }
}
