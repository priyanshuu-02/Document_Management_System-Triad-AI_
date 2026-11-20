/**
 * Loads the metadata fields the admin has set up (Admin / Settings page).
 *
 * Nothing in the UI hardcodes field names. The sign-up page, filters, upload
 * form and search all build their dropdowns from this list, so a new field
 * or a new option added by an admin shows up everywhere.
 *
 * The list is fetched once and shared. Call reloadMetadataFields() after the
 * admin changes something.
 */
import { useEffect, useState } from 'react';
import client from './client';

// Access control is built on the "Division" field, so it is handled a bit
// differently from the other fields (users can't pick it on upload, etc.).
export const DIVISION_FIELD = 'Division';
const FALLBACK_DIVISIONS = ['Division A', 'Division B', 'Division C'];

let cache = null;        // the last list we loaded
let pending = null;      // a request that is already running
const listeners = new Set();

function load() {
  if (!pending) {
    pending = client
      .get('/admin/metadata-fields')
      .then((res) => {
        cache = res.data?.fields || [];
        listeners.forEach((listener) => listener(cache));
        return cache;
      })
      .catch((err) => {
        console.error('Failed to load metadata fields:', err);
        return cache || [];
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Fetch the list again (e.g. after an admin edits a field). */
export const reloadMetadataFields = () => load();

export const isDivisionField = (field) =>
  (field?.name || '').toLowerCase() === DIVISION_FIELD.toLowerCase();

export function useMetadataFields() {
  const [fields, setFields] = useState(cache || []);

  useEffect(() => {
    listeners.add(setFields);
    if (!cache) load();
    return () => listeners.delete(setFields);
  }, []);

  const divisionField = fields.find(isDivisionField);
  const divisions = divisionField?.options?.length ? divisionField.options : FALLBACK_DIVISIONS;

  // Dropdown fields other than Division: these become filters.
  const filterFields = fields.filter((f) => !isDivisionField(f) && f.field_type === 'select' && f.options?.length);

  return { fields, divisions, filterFields, loaded: cache !== null };
}
