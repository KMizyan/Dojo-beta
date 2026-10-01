'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getMembershipStatus,
  type MembershipStatus
} from '../../lib/entitlements';

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:8000';

type BillingMembership = {
  status?: MembershipStatus;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

export default function AccountPage(){
  const [email,setEmail]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [membership,setMembership]=
    useState<MembershipStatus>('trial');
  const [billing,setBilling]=
    useState<BillingMembership|null>(null);
  const [billingBusy,setBillingBusy]=useState(false);
  const [billingError,setBillingError]=useState<string|null>(null);
  const [checkoutMessage,setCheckoutMessage]=useState<string|null>(null);

  useEffect(()=>{
    let active=true;

    async function load(){
      const {data,error}=await supabase.auth.getUser();

      if(!active) return;

      if(error || !data.user){
        const next=encodeURIComponent('/account');
        window.location.replace(`/login?next=${next}`);
        return;
      }

      setEmail(data.user.email ?? null);

      const params=new URLSearchParams(window.location.search);
      const checkout=params.get('checkout');

      if(checkout==='success'){
        setCheckoutMessage(
          'Payment received. Your membership is being confirmed.'
        );

        window.history.replaceState(
          {},
          '',
          window.location.pathname
        );
      } else if(checkout==='cancelled'){
        setCheckoutMessage(
          'Checkout was cancelled. No membership change was made.'
        );

        window.history.replaceState(
          {},
          '',
          window.location.pathname
        );
      }

      try{
        const status=await getMembershipStatus();

        if(!active) return;

        setMembership(status);

        const {data:membershipRow,error:membershipError}=
          await supabase
            .from('memberships')
            .select(
              'status,stripe_customer_id,stripe_subscription_id,' +
              'stripe_price_id,current_period_end,cancel_at_period_end'
            )
            .eq('user_id',data.user.id)
            .maybeSingle();

        if(membershipError){
          console.warn(
            'Could not load billing membership details:',
            membershipError
          );
        } else if(active){
          setBilling(membershipRow as BillingMembership|null);
        }
      } catch(error){
        console.error(
          'Could not load membership:',
          error
        );

        if(active){
          setMembership('trial');
        }
      } finally {
        if(active){
          setLoading(false);
        }
      }
    }

    load();

    return ()=>{
      active=false;
    };
  },[]);

  async function logOut(){
    await supabase.auth.signOut();
    window.location.href='/';
  }

  async function billingRequest(
    endpoint:'/billing/checkout'|'/billing/portal'
  ){
    setBillingBusy(true);
    setBillingError(null);

    try{
      const {
        data:{session},
        error
      }=await supabase.auth.getSession();

      if(error || !session?.access_token){
        window.location.href=
          `/login?next=${encodeURIComponent('/account')}`;
        return;
      }

      const response=await fetch(`${API}${endpoint}`,{
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
          'DOJO could not open billing. Please try again.'
        );
      }

      if(!result?.url){
        throw new Error(
          'DOJO did not receive a billing destination.'
        );
      }

      window.location.assign(result.url);
    } catch(error){
      console.error('Billing request failed:',error);

      setBillingError(
        error instanceof Error
          ? error.message
          : 'DOJO could not open billing. Please try again.'
      );

      setBillingBusy(false);
    }
  }

  const stripeBackedMember=
    membership==='member' &&
    Boolean(
      billing?.stripe_customer_id &&
      billing?.stripe_subscription_id
    );

  const periodEnd=
    billing?.current_period_end
      ? new Date(billing.current_period_end)
      : null;

  const periodEndLabel=
    periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.toLocaleDateString('en-GB',{
          day:'numeric',
          month:'long',
          year:'numeric'
        })
      : null;

  if(loading){
    return (
      <main className="page">
        <p>Loading account...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Account</h1>

      <section
        style={{
          marginTop:20,
          padding:20,
          border:'1px solid #d7d7d7',
          borderRadius:12
        }}
      >
        <h2 style={{marginTop:0}}>Account details</h2>

        <p>
          <strong>Email</strong><br />
          {email}
        </p>

        <p>
          <Link href="/forgot-password">
            Reset password
          </Link>
        </p>

        <button type="button" onClick={logOut}>
          Log out
        </button>
      </section>

      <section
        style={{
          marginTop:20,
          padding:20,
          border:'1px solid #d7d7d7',
          borderRadius:12
        }}
      >
        <h2 style={{marginTop:0}}>DOJO membership</h2>

        {checkoutMessage && (
          <p
            style={{
              padding:12,
              border:'1px solid #d7d7d7',
              borderRadius:8
            }}
          >
            {checkoutMessage}
          </p>
        )}

        {billingError && (
          <p role="alert">
            {billingError}
          </p>
        )}

        {membership==='member' ? (
          <>
            <p>
              <strong>DOJO member</strong>
            </p>

            <p>
              Your membership includes continued access to
              DOJO's premium features without the trial
              allowances.
            </p>

            {stripeBackedMember && (
              <>
                {billing?.cancel_at_period_end ? (
                  <p>
                    Your membership is set to end
                    {periodEndLabel
                      ? ` on ${periodEndLabel}`
                      : ' at the end of the current billing period'}.
                    {' '}You'll keep member access until then.
                  </p>
                ) : periodEndLabel ? (
                  <p>
                    Your current billing period runs until{' '}
                    {periodEndLabel}.
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={billingBusy}
                  onClick={()=>
                    billingRequest('/billing/portal')
                  }
                >
                  {billingBusy
                    ? 'Opening billing...'
                    : 'Manage billing'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p>
              <strong>Trial account</strong>
            </p>

            <p>
              You're currently trying DOJO. Your trial includes
              saved work, progress tracking and limited access
              to DOJO's premium features.
            </p>

            <div
              style={{
                marginTop:20,
                padding:18,
                border:'1px solid #d7d7d7',
                borderRadius:10
              }}
            >
              <h3 style={{marginTop:0}}>
                DOJO Membership
              </h3>

              <p
                style={{
                  fontSize:'1.35rem',
                  fontWeight:700,
                  marginBottom:8
                }}
              >
                £12.99/month
              </p>

              <p>
                Keep full access to generated papers,
                personalised question sets, Ask DOJO and
                the rest of your DOJO practice workspace.
              </p>

              <p>
                Cancel anytime. If you cancel, your member
                access continues until the end of the paid
                billing period.
              </p>

              <button
                type="button"
                disabled={billingBusy}
                onClick={()=>
                  billingRequest('/billing/checkout')
                }
              >
                {billingBusy
                  ? 'Opening checkout...'
                  : 'Join DOJO'}
              </button>
            </div>
          </>
        )}
      </section>

      <section
        style={{
          marginTop:20,
          padding:20,
          border:'1px solid #d7d7d7',
          borderRadius:12
        }}
      >
        <h2 style={{marginTop:0}}>Data &amp; privacy</h2>

        <p style={{marginBottom:0}}>
          DOJO stores the account and activity data needed to save your
          work, track your progress and personalise your practice.
        </p>
      </section>
    </main>
  );
}
