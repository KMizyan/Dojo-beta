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
  const [paperCheckoutBusy,setPaperCheckoutBusy]=useState(false);
  const [paperCheckoutError,setPaperCheckoutError]=useState<string|null>(null);

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

  async function startPaperCheckout(){
    if(paperCheckoutBusy) return;

    setPaperCheckoutBusy(true);
    setPaperCheckoutError(null);

    try{
      const {
        data:{session},
        error
      }=await supabase.auth.getSession();

      if(error || !session?.access_token){
        window.location.href=
          `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const response=await fetch(`${API}/billing/checkout`,{
        method:'POST',
        headers:{
          'Authorization':`Bearer ${session.access_token}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          return_url:`${window.location.origin}/account`
        })
      });

      let result:any=null;

      try{
        result=await response.json();
      } catch {
        result=null;
      }

      if(!response.ok){
        throw new Error(
          result?.detail ??
          'DOJO could not open checkout. Please try again.'
        );
      }

      if(!result?.url){
        throw new Error(
          'DOJO did not receive a checkout destination.'
        );
      }

      window.location.assign(result.url);
    } catch(error){
      console.error('Paper checkout failed:',error);

      setPaperCheckoutError(
        error instanceof Error
          ? error.message
          : 'DOJO could not open checkout. Please try again.'
      );

      setPaperCheckoutBusy(false);
    }
  }

  if (state === 'exhausted') {
    return (
      <main className="paperUpgradePage">
        <section className="paperUpgradeHero">
          <div className="paperUpgradeMain">
            <span className="paperUpgradeEyebrow">
              YOUR FREE DOJO PAPERS
            </span>

            <div className="paperUpgradeUsage">
              <div>
                <strong>3 / 3</strong>
                <span>free papers used</span>
              </div>

              <div className="paperUpgradeUsageBar">
                <span />
              </div>
            </div>

            <h1>
              Keep generating
              <br />
              DOJO Papers.
            </h1>

            <p className="paperUpgradeLead">
              You&apos;ve used all 3 free paper generations.
              Join DOJO to keep building fresh papers whenever
              you want another full exam-style session.
            </p>

            <div className="paperUpgradeReassurance">
              Nothing you&apos;ve already done disappears.
              Your existing papers, results and Review history
              stay in your account.
            </div>
          </div>

          <aside className="paperUpgradePlan">
            <span className="paperUpgradePlanLabel">
              DOJO MEMBERSHIP
            </span>

            <div className="paperUpgradePrice">
              <strong>&pound;12.99</strong>
              <span>/ month</span>
            </div>

            <p className="paperUpgradePlanIntro">
              Continue using the full DOJO practice workspace.
            </p>

            <div className="paperUpgradeBenefits">
              <div>
                <span className="paperUpgradeTick" aria-hidden="true"></span>
                <div>
                  <strong>Keep generating DOJO Papers</strong>
                  <span>
                    Build fresh papers after your trial allowance.
                  </span>
                </div>
              </div>

              <div>
                <span className="paperUpgradeTick" aria-hidden="true"></span>
                <div>
                  <strong>Personalised Question Sets</strong>
                  <span>
                    Build targeted sets around the work you need.
                  </span>
                </div>
              </div>

              <div>
                <span className="paperUpgradeTick" aria-hidden="true"></span>
                <div>
                  <strong>SENSEI</strong>
                  <span>
                    Get help inside your question workspace.
                  </span>
                </div>
              </div>

              <div>
                <span className="paperUpgradeTick" aria-hidden="true"></span>
                <div>
                  <strong>Keep everything connected</strong>
                  <span>
                    Saved work, marking, results and Review.
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="paperUpgradePrimary"
              onClick={startPaperCheckout}
              disabled={paperCheckoutBusy}
            >
              <span>
                {paperCheckoutBusy ? 'Opening checkout...' : 'Join DOJO'}
              </span>
              <span aria-hidden="true">&rarr;</span>
            </button>

            {paperCheckoutError && (
              <p className="paperUpgradeCheckoutError" role="alert">
                {paperCheckoutError}
              </p>
            )}

            <span className="paperUpgradeFinePrint">
              Cancel anytime.
            </span>


          </aside>
        </section>

        <section className="paperUpgradeValue">
          <div className="paperUpgradeValueIntro">
            <span className="paperUpgradeEyebrow">
              WHY KEEP GOING?
            </span>

            <h2>
              A fresh paper should lead somewhere.
            </h2>

            <p>
              DOJO Papers stay part of the same workflow from
              generation to marking to Review.
            </p>
          </div>

          <div className="paperUpgradeValueCards">
            <div>
              <span>01</span>
              <strong>Generate</strong>
              <p>
                Build another exam-style paper from the DOJO
                question bank.
              </p>
            </div>

            <div>
              <span>02</span>
              <strong>Mark</strong>
              <p>
                Mark it inside DOJO with solutions and SENSEI
                available when you need them.
              </p>
            </div>

            <div>
              <span>03</span>
              <strong>Review</strong>
              <p>
                Keep the result, flag questions and return to
                the work that needs another attempt.
              </p>
            </div>
          </div>
        </section>

        <div className="paperUpgradeExit">
          <Link href="/papers">
            &larr; Back to Papers
          </Link>
        </div>

        <style jsx>{`
          .paperUpgradePage {
            width: min(1120px, calc(100% - 40px));
            margin: 0 auto;
            padding: 64px 0 80px;
          }

          .paperUpgradeHero {
            display: grid;
            grid-template-columns:
              minmax(0, 1.15fr)
              minmax(340px, .85fr);
            overflow: hidden;
            border: 1px solid #d9ddda;
            border-radius: 18px;
            background: #fff;
          }

          .paperUpgradeMain {
            padding: 52px 52px 50px;
            background: #f8f8f5;
          }

          .paperUpgradeEyebrow,
          .paperUpgradePlanLabel {
            display: block;
            color: #124fad;
            font-size: 10px;
            font-weight: 850;
            letter-spacing: .12em;
          }

          .paperUpgradeUsage {
            display: flex;
            align-items: center;
            gap: 18px;
            margin: 30px 0 27px;
          }

          .paperUpgradeUsage > div:first-child {
            flex: 0 0 auto;
          }

          .paperUpgradeUsage strong,
          .paperUpgradeUsage span {
            display: block;
          }

          .paperUpgradeUsage strong {
            color: #111412;
            font-size: 20px;
            line-height: 1;
          }

          .paperUpgradeUsage span {
            margin-top: 4px;
            color: #727974;
            font-size: 10px;
            font-weight: 700;
          }

          .paperUpgradeUsageBar {
            flex: 1;
            max-width: 250px;
            height: 7px;
            overflow: hidden;
            border-radius: 999px;
            background: #e1e4e1;
          }

          .paperUpgradeUsageBar span {
            display: block;
            width: 100%;
            height: 100%;
            margin: 0;
            background: #124fad;
          }

          .paperUpgradeMain h1 {
            max-width: 650px;
            margin: 0 0 18px;
            color: #0e110f;
            font-size: clamp(42px, 5vw, 64px);
            line-height: .98;
            letter-spacing: -.052em;
          }

          .paperUpgradeLead {
            max-width: 590px;
            margin: 0;
            color: #565f59;
            font-size: 15px;
            line-height: 1.65;
          }

          .paperUpgradeReassurance {
            max-width: 600px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dfe2df;
            color: #707772;
            font-size: 11px;
            line-height: 1.55;
          }

          .paperUpgradePlan {
            display: flex;
            flex-direction: column;
            padding: 42px 38px;
            background: #111512;
            color: #fff;
          }

          .paperUpgradePlanLabel {
            color: #9bb8ff;
          }

          .paperUpgradePrice {
            display: flex;
            align-items: baseline;
            gap: 7px;
            margin-top: 18px;
          }

          .paperUpgradePrice strong {
            font-size: 37px;
            line-height: 1;
            letter-spacing: -.04em;
          }

          .paperUpgradePrice span {
            color: #aeb6b0;
            font-size: 13px;
          }

          .paperUpgradePlanIntro {
            margin: 12px 0 0;
            color: #bcc3be;
            font-size: 12px;
            line-height: 1.5;
          }

          .paperUpgradeBenefits {
            display: grid;
            gap: 17px;
            margin: 30px 0 36px;
          }

          .paperUpgradeBenefits > div {
            display: grid;
            grid-template-columns: 22px minmax(0,1fr);
            gap: 10px;
          }

          .paperUpgradeTick {
            position: relative;
            display: block;
            width: 19px;
            height: 19px;
            border-radius: 50%;
            background: #244fbd;
          }

          .paperUpgradeTick::after {
            content: "";
            position: absolute;
            left: 6px;
            top: 4px;
            width: 5px;
            height: 8px;
            box-sizing: border-box;
            border-right: 2px solid #fff;
            border-bottom: 2px solid #fff;
            transform: rotate(45deg);
          }

          .paperUpgradeBenefits strong,
          .paperUpgradeBenefits div span {
            display: block;
          }

          .paperUpgradeBenefits strong {
            font-size: 12px;
          }

          .paperUpgradeBenefits div span {
            margin-top: 3px;
            color: #9fa8a1;
            font-size: 10px;
            line-height: 1.4;
          }

          :global(button.paperUpgradePrimary) {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            min-height: 62px !important;
            box-sizing: border-box !important;
            padding: 0 22px !important;
            margin: 0 !important;
            border: 2px solid #5f82ff !important;
            border-radius: 10px !important;
            background: #315ee7 !important;
            color: #ffffff !important;
            font-size: 16px !important;
            font-weight: 850 !important;
            line-height: 1 !important;
            text-decoration: none !important;
            box-shadow:
              0 0 0 1px rgba(255,255,255,.08),
              0 12px 30px rgba(24,66,194,.34) !important;
            transition:
              transform .15s ease,
              background .15s ease,
              border-color .15s ease,
              box-shadow .15s ease;
          }

          :global(a.paperUpgradePrimary:hover) {
            border-color: #7895ff !important;
            background: #3d68e9 !important;
            color: #ffffff !important;
            transform: translateY(-1px);
            box-shadow:
              0 0 0 1px rgba(255,255,255,.12),
              0 15px 34px rgba(24,66,194,.42) !important;
          }

          :global(a.paperUpgradePrimary span:first-child) {
            color: #ffffff !important;
          }

          :global(a.paperUpgradePrimary span:last-child) {
            color: #ffffff !important;
            font-size: 21px !important;
            font-weight: 500 !important;
          }

          :global(button.paperUpgradePrimary) {
            cursor: pointer;
            font-family: inherit;
          }

          :global(button.paperUpgradePrimary:disabled) {
            cursor: wait;
            opacity: .82;
            transform: none;
          }

          .paperUpgradeCheckoutError {
            margin: 12px 0 0;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 8px;
            color: #ffffff;
            font-size: 12px;
            line-height: 1.45;
          }

          .paperUpgradeFinePrint {
            margin-top: 10px;
            color: #868f88;
            font-size: 9px;
            text-align: center;
          }

          .paperUpgradeValue {
            display: grid;
            grid-template-columns:
              minmax(220px,.7fr)
              minmax(0,1.3fr);
            gap: 42px;
            margin-top: 18px;
            padding: 34px 36px;
            border: 1px solid #dce0dc;
            border-radius: 15px;
            background: #fff;
          }

          .paperUpgradeValueIntro h2 {
            margin: 8px 0 8px;
            font-size: 24px;
            line-height: 1.12;
            letter-spacing: -.03em;
          }

          .paperUpgradeValueIntro p {
            margin: 0;
            color: #6a726c;
            font-size: 12px;
            line-height: 1.55;
          }

          .paperUpgradeValueCards {
            display: grid;
            grid-template-columns: repeat(3,minmax(0,1fr));
            gap: 10px;
          }

          .paperUpgradeValueCards > div {
            padding: 18px;
            border: 1px solid #e1e4e1;
            border-radius: 10px;
            background: #fafaf8;
          }

          .paperUpgradeValueCards > div > span {
            display: block;
            margin-bottom: 22px;
            color: #a0a7a2;
            font-size: 9px;
            font-weight: 800;
          }

          .paperUpgradeValueCards strong {
            display: block;
            font-size: 13px;
          }

          .paperUpgradeValueCards p {
            margin: 6px 0 0;
            color: #727974;
            font-size: 10px;
            line-height: 1.5;
          }

          .paperUpgradeExit {
            display: flex;
            justify-content: center;
            padding: 22px 0 0;
          }

          .paperUpgradeExit :global(a) {
            color: #727974;
            font-size: 11px;
            font-weight: 700;
            text-decoration: none;
          }

          .paperUpgradeExit :global(a:hover) {
            color: #242a26;
          }

          @media (max-width: 800px) {
            .paperUpgradePage {
              width: min(100% - 28px, 1120px);
              padding: 30px 0 55px;
            }

            .paperUpgradeHero,
            .paperUpgradeValue {
              grid-template-columns: 1fr;
            }

            .paperUpgradeMain {
              padding: 32px 24px;
            }

            .paperUpgradeMain h1 {
              font-size: 42px;
            }

            .paperUpgradePlan {
              padding: 30px 24px;
            }

            .paperUpgradeValue {
              padding: 26px 22px;
            }

            .paperUpgradeValueCards {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
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
