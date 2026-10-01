'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import GeneratedExam from '../../../components/GeneratedExam';
import { supabase } from '../../../lib/supabase';
import {
  consumeTrialEntitlement,
  releaseTrialEntitlement,
} from '../../../lib/entitlements';

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:8000';

type LoadState =
  | 'loading'
  | 'ready'
  | 'logged_out'
  | 'exhausted'
  | 'error';

export default function GeneratedPaperPage() {
  const [paper, setPaper] = useState<any>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');

  const [options, setOptions] = useState({
    examMode: true,
    askDojo: false,
    solutions: false,
    timer: true,
    freeNav: false,
  });

  useEffect(() => {
    let active = true;
    let consumedKey: string | null = null;
    let generationSucceeded = false;

    async function load() {
      try {
        const params = new URLSearchParams(
          window.location.search
        );

        const level = params.get('level') || 'A-level';
        const area = params.get('area') || 'Pure';

        const rawMarks = Number(params.get('marks')) || 40;
        const marks = Math.max(
          10,
          Math.min(rawMarks, 100)
        );

        const examMode =
          params.get('examMode') !== '0';

        setOptions({
          examMode,
          askDojo:
            !examMode && params.get('askDojo') === '1',
          solutions:
            !examMode && params.get('solutions') === '1',
          timer:
            examMode || params.get('timer') === '1',
          freeNav:
            !examMode && params.get('freeNav') === '1',
        });

        const { data, error: authError } =
          await supabase.auth.getUser();

        if (authError || !data.user) {
          if (active) setState('logged_out');
          return;
        }

        const resourceKey = params.get('generationId');

        if (!resourceKey) {
          throw new Error(
            'Invalid paper generation request. Please start again from Papers.'
          );
        }

        const entitlement =
          await consumeTrialEntitlement(
            'generated_paper',
            resourceKey
          );

        if (!entitlement.allowed) {
          if (active) setState('exhausted');
          return;
        }

        consumedKey = entitlement.consumed
          ? resourceKey
          : null;

        const response = await fetch(
          `${API}/papers/generated?level=${
            encodeURIComponent(level)
          }&area=${
            encodeURIComponent(area)
          }&target_marks=${marks}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error(
            'DOJO could not generate this paper.'
          );
        }

        const generatedPaper = await response.json();

        if (!generatedPaper) {
          throw new Error(
            'DOJO could not generate this paper.'
          );
        }

        generationSucceeded = true;

        if (!active) return;

        setPaper(generatedPaper);
        setState('ready');
      } catch (err: any) {
        if (consumedKey && !generationSucceeded) {
          try {
            await releaseTrialEntitlement(
              'generated_paper',
              consumedKey
            );
            consumedKey = null;
          } catch (releaseError) {
            console.error(
              'Could not release failed paper generation:',
              releaseError
            );
          }
        }

        if (active) {
          setError(
            err?.message ||
              'DOJO could not generate this paper.'
          );
          setState('error');
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <main className="generatedExamPage">
        <div className="examLoadError">
          <h1>Generating paper...</h1>
          <p>DOJO is building your paper.</p>
        </div>
      </main>
    );
  }

  if (state === 'logged_out') {
    return (
      <main className="generatedExamPage">
        <div className="examLoadError">
          <h1>Trial account required</h1>
          <p>
            Create an account or log in to generate DOJO
            papers.
          </p>
          <p>
            <Link href="/login?next=%2Fpapers">
              Log in
            </Link>
            {' · '}
            <Link href="/signup?next=%2Fpapers">
              Create account
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (state === 'exhausted') {
    return (
      <main className="generatedExamPage">
        <div className="examLoadError">
          <h1>Generated paper trial used</h1>
          <p>
            You've used your 3 trial paper generations.
            Your other trial features and existing work are
            still available.
          </p>
          <p>
            DOJO membership gives you continued access to
            generated papers.
          </p>

          <p>
            <Link href="/account">
              View membership →
            </Link>
            {' · '}
            <Link href="/papers">
              Back to Papers
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (state === 'error' || !paper) {
    return (
      <main className="generatedExamPage">
        <div className="examLoadError">
          <h1>Paper unavailable</h1>
          <p>
            {error ||
              'DOJO could not generate this paper.'}
          </p>
          <p>
            This attempt has not been taken from your
            trial allowance.
          </p>
          <p>
            <Link href="/papers">
              Back to Papers
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <GeneratedExam
      paper={paper}
      options={options}
    />
  );
}
