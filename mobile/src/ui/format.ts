import { Photo, photoTakenDate } from '../model/photo';

/** Metres, written the way a person would say them. */
export function metresLabel(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.trunc(metres)} m`;
}

/** Uncovered world, coarse once there is a lot of it. */
export function areaLabel(km2: number): string {
  return km2 < 10 ? `${km2.toFixed(1)} km²` : `${Math.trunc(km2)} km²`;
}

/** Thousands separators, as `Int.formatted()` gave. */
export const groupedNumber = (value: number): string => value.toLocaleString();

/** "12.3%" */
export const percentLabel = (value: number): string => `${Math.min(100, Math.max(0, value)).toFixed(1)}%`;

/** "March 2025" */
export const monthAndYear = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** "12 Mar 2025" */
export const abbreviatedDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "12 Mar 2025 at 14:05" */
export const abbreviatedDateAndTime = (date: Date): string =>
  `${abbreviatedDate(date)}, ${date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

/** "12 March 2025 at 14:05" */
export const longDateAndTime = (date: Date): string =>
  `${date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

/** "34 m away · March 2025" */
export function photoSubtitle(photo: Photo): string {
  const distance = photo.distanceM == null ? '' : `${photo.distanceM} m away`;
  return [distance, monthAndYear(photoTakenDate(photo))].filter(Boolean).join(' · ');
}

/** Five decimal places, the way the capture sheet prints a fix. */
export const coordinateLabel = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
