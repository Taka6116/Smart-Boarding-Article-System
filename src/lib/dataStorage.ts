import { readFile, writeFile, mkdir, unlink, access } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')
const META_PATH = path.join(UPLOAD_DIR, '_meta.json')

export interface StoredFileMeta {
  id: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
}

interface MetaFile {
  files: StoredFileMeta[]
}

export function getUploadDir(): string {
  return UPLOAD_DIR
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true })
}

export async function readMeta(): Promise<StoredFileMeta[]> {
  try {
    const raw = await readFile(META_PATH, 'utf-8')
    const data = JSON.parse(raw) as MetaFile
    return data.files ?? []
  } catch {
    return []
  }
}

export async function writeMeta(files: StoredFileMeta[]): Promise<void> {
  await ensureUploadDir()
  await writeFile(META_PATH, JSON.stringify({ files }, null, 2), 'utf-8')
}

export async function addFile(meta: StoredFileMeta): Promise<void> {
  const files = await readMeta()
  files.push(meta)
  await writeMeta(files)
}

export async function removeFileById(id: string): Promise<boolean> {
  const files = await readMeta()
  const index = files.findIndex(f => f.id === id)
  if (index === -1) return false
  const [removed] = files.splice(index, 1)
  const filePath = path.join(UPLOAD_DIR, removed.storedName)
  try {
    await unlink(filePath)
  } catch {
    // ファイルが無くてもメタは更新する
  }
  await writeMeta(files)
  return true
}

export function getFilePath(storedName: string): string {
  return path.join(UPLOAD_DIR, storedName)
}

export async function findFileById(id: string): Promise<StoredFileMeta | null> {
  const files = await readMeta()
  return files.find(f => f.id === id) ?? null
}
