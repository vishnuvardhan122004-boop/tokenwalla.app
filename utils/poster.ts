/**
 * utils/poster.ts — the links a clinic poster carries. The app mirror of the
 * website's /poster page (ROADMAP item 58). The QR always points at the production
 * site, whatever build this is, so a poster made from a preview build still works
 * on a wall. `src=poster` is only a label for counting later; nothing reads it yet.
 */
import { providerLabel } from './booking';

export const WEB_URL = 'https://www.tokenwalla.com';

export type PosterKind = 'doctor' | 'scan';

export interface PosterTarget {
  kind: PosterKind;
  id: number | string;
  name: string;
  /** Doctors only. */
  specialization?: string;
  hospital?: string;
  city?: string;
}

/** The public page a poster opens; the same routes the website serves. */
export const posterPath = (kind: PosterKind, id: number | string) =>
  kind === 'doctor' ? `/doctor/${id}` : `/scan-center/${id}`;

/** The plain link people share. */
export const posterLink = (kind: PosterKind, id: number | string) => `${WEB_URL}${posterPath(kind, id)}`;

/** What the QR holds: the same page, labelled. */
export const posterQrValue = (kind: PosterKind, id: number | string) => `${posterLink(kind, id)}?src=poster`;

/** The message for the share sheet: who, where, then the line and the link last. */
export function posterShareText(target: PosterTarget, tagline: string): string {
  const doctor = target.kind === 'doctor';
  return [
    `${doctor ? '👨‍⚕️' : '🏥'} ${doctor ? providerLabel(target.name) : target.name}`,
    doctor && target.specialization ? `🩺 ${target.specialization}` : null,
    doctor && target.hospital ? `🏥 ${target.hospital}` : null,
    target.city ? `📍 ${target.city}` : null,
    '',
    `${tagline} ${posterLink(target.kind, target.id)}`,
  ].filter(line => line !== null).join('\n');
}
