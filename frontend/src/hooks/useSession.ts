import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@/lib/types';

const STORAGE_KEY = 'enem-simulado';

/**
 * The simulado in progress, mirrored to localStorage on every change.
 *
 * Answering 45 questions and losing them to an accidental refresh is the kind
 * of paper cut that costs a user for good. Storing the questions verbatim is
 * only safe because `/exams/draw` strips the answer key — nothing secret ends
 * up on disk.
 */
function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as Session;
    // Guard against a half-written or outdated shape from an older version.
    if (!Array.isArray(session.questions) || session.questions.length === 0) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(read);

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Full or blocked storage still leaves the session usable in memory.
    }
  }, [session]);

  /**
   * Accepts an updater so callers can merge against the *current* session.
   * Grading in treino fires one request per question, and their replies can
   * land out of order — patching from a captured render would drop results.
   */
  const update = useCallback(
    (patch: Partial<Session> | ((current: Session) => Partial<Session>)) =>
      setSession((current) => {
        if (!current) return current;
        const next = typeof patch === 'function' ? patch(current) : patch;
        return { ...current, ...next };
      }),
    [],
  );

  return { session, setSession, update };
}
