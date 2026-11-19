import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Signed URLs for private attachments, cached in memory for most of their
// hour so scrolling back through photos does not re-sign each one.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 50 * 60 * 1000;

export function useAttachmentUrl(path: string | null | undefined): { url: string | null; failed: boolean } {
  const cached = path ? cache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(cached && cached.expires > Date.now() ? cached.url : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) {
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    api
      .signedAttachmentUrl(path)
      .then((signed) => {
        cache.set(path, { url: signed, expires: Date.now() + TTL_MS });
        if (!cancelled) setUrl(signed);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { url, failed };
}
