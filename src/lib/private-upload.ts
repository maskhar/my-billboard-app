import 'server-only';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Role } from '@prisma/client';
import { peranBoleh, PERAN_PEMBACA_PESANAN } from './gerbang-peran';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

export function isPrivateUploadFilename(file: string): boolean {
  return typeof file === 'string' && FILE_PATTERN.exec(file)?.[0] === file;
}

function storageDirectory(): string {
  const configuredRoot = process.env.PRIVATE_UPLOAD_STORAGE_ROOT?.trim();
  if (configuredRoot) {
    if (!path.isAbsolute(configuredRoot)) {
      throw new Error('PRIVATE_UPLOAD_STORAGE_ROOT must be an absolute path');
    }
    return path.resolve(configuredRoot);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PRIVATE_UPLOAD_STORAGE_ROOT must be configured in production');
  }
  return path.join(process.cwd(), 'uploads', 'private', 'designs');
}

async function ensureStorageDirectory(): Promise<string> {
  const directory = storageDirectory();
  if (process.env.NODE_ENV !== 'production') {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return directory;
  }
  const directoryStat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      throw new Error('PRIVATE_UPLOAD_STORAGE_ROOT must be a provisioned directory in production');
    }
    throw error;
  });
  if (!directoryStat.isDirectory()) {
    throw new Error('PRIVATE_UPLOAD_STORAGE_ROOT must be a directory in production');
  }
  return directory;
}

function storagePath(directory: string, filename: string): string {
  const filePath = path.resolve(directory, filename);
  const relativePath = path.relative(directory, filePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error('Invalid private upload path');
  }
  return filePath;
}

export async function savePrivateUpload(buffer: Buffer, extension: string, ownerUserId: string): Promise<string> {
  if (!Object.hasOwn(MIME_TYPES, extension) || !ownerUserId || buffer.length > 10 * 1024 * 1024) {
    throw new Error('Invalid private upload');
  }
  const directory = await ensureStorageDirectory();
  const filename = `${randomUUID()}.${extension}`;
  const filePath = storagePath(directory, filename);
  const metadataPath = storagePath(directory, `${filename}.json`);
  await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  try {
    await writeFile(metadataPath, JSON.stringify({ version: 1, filename, ownerUserId }), {
      flag: 'wx', mode: 0o600,
    });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
  return `/api/files/design/${filename}`;
}

export async function readPrivateUpload(file: string, user: { id: string; role?: Role }) {
  if (!isPrivateUploadFilename(file) || !user.id) return null;
  const directory = await ensureStorageDirectory();
  const filePath = storagePath(directory, file);
  const metadataPath = storagePath(directory, `${file}.json`);
  try {
    const metadataStat = await lstat(metadataPath);
    if (!metadataStat.isFile() || metadataStat.size > 4096) return null;
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (!metadata || metadata.version !== 1 || metadata.filename !== file
      || typeof metadata.ownerUserId !== 'string' || !metadata.ownerUserId) return null;
    if (metadata.ownerUserId !== user.id && !peranBoleh(PERAN_PEMBACA_PESANAN, user.role)) return null;
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) return null;
    const buffer = await readFile(filePath);
    const extension = path.extname(file).slice(1);
    return { buffer, contentType: MIME_TYPES[extension], attachment: extension === 'pdf' };
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
