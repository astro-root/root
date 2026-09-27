// Server-side, read-only Firestore access via the plain REST API.
// Deliberately dependency-free (just fetch) so it behaves identically in
// `astro dev` (Node) and on Cloudflare Pages (Workers runtime).
//
// This only ever reads PUBLIC data (projects, published posts, about,
// settings) — Firestore Security Rules must allow unauthenticated reads
// for those documents. Writes always go through the Admin panel using the
// signed-in user's Firebase Auth token (see firebase-client.ts), never
// through this file.

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDoc {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function decodeValue(v: FirestoreValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeValue(value);
  }
  return out;
}

function decodeDoc(doc: FirestoreDoc): Record<string, unknown> {
  const id = doc.name.split('/').pop() as string;
  return { id, ...decodeFields(doc.fields ?? {}) };
}

function projectId(): string | undefined {
  return import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
}

export const isFirestoreConfigured = Boolean(projectId());

const BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents`;

/** Fetch every document in a top-level collection. Returns [] on any failure. */
export async function fetchCollection(name: string): Promise<Record<string, unknown>[]> {
  if (!isFirestoreConfigured) return [];
  try {
    const res = await fetch(`${BASE()}/${name}?pageSize=300`);
    if (!res.ok) return [];
    const json = (await res.json()) as { documents?: FirestoreDoc[] };
    return (json.documents ?? []).map(decodeDoc);
  } catch {
    return [];
  }
}

/** Fetch a single document by collection + id. Returns null on any failure. */
export async function fetchDoc(
  name: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (!isFirestoreConfigured) return null;
  try {
    const res = await fetch(`${BASE()}/${name}/${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as FirestoreDoc;
    if (!json.fields) return null;
    return decodeDoc(json);
  } catch {
    return null;
  }
}
