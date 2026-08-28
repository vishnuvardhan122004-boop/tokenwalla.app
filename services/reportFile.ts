// Open a document a provider shared with the patient.
//
// Never a plain link: the download endpoint re-checks ownership on every
// request and needs the Authorization header, so opening the URL in a browser
// would 401. Pull the bytes through the API client, write them to a private
// cache file, and hand that to the share sheet.
import * as Sharing from 'expo-sharing';

import API from './api';

// A provider may share a photographed report, not only a PDF, and the extension
// is what decides which app the share sheet can offer. It comes from the
// server's `original_name` because the storage does not keep it — Cloudinary
// strips the extension from the public_id.
const MIME: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heic',
};

function extensionOf(name: string): string {
  const lower = String(name || '').toLowerCase();
  const ext   = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  return MIME[ext] ? ext : '.pdf';
}

/** Download the document and open the OS share sheet. Throws on failure. */
export async function openSharedDocument(report: any) {
  const FileSystem = await import('expo-file-system');
  const res = await API.get(String(report.download_url).replace(/^\/api/, ''), {
    responseType: 'arraybuffer',
  });
  const ext      = extensionOf(report.original_name);
  const bytes    = new Uint8Array(res.data as ArrayBuffer);
  const safeName = String(report.title || 'document').replace(/[^\w.-]+/g, '_').slice(0, 60);

  const target = new FileSystem.File(FileSystem.Paths.cache, `${safeName}${ext}`);
  if (target.exists) target.delete();
  target.create();
  target.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing-unavailable');
  }
  await Sharing.shareAsync(target.uri, {
    mimeType:    MIME[ext],
    dialogTitle: report.title || 'Document',
    UTI:         ext === '.pdf' ? 'com.adobe.pdf' : 'public.image',
  });
}
