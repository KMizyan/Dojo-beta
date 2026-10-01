'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getMembershipStatus,
  type MembershipStatus
} from '../../lib/entitlements';

export default function AccountPage(){
  const [email,setEmail]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [membership,setMembership]=
    useState<MembershipStatus>('trial');

  useEffect(()=>{
    let active=true;

    supabase.auth.getUser().then(({data})=>{
      if(!active) return;

      if(!data.user){
        const next=encodeURIComponent('/account');
        window.location.replace(`/login?next=${next}`);
        return;
      }

      setEmail(data.user.email ?? null);

      getMembershipStatus()
        .then(status=>{
          if(!active) return;
          setMembership(status);
          setLoading(false);
        })
        .catch(error=>{
          console.error(
            'Could not load membership:',
            error
          );

          if(!active) return;
          setMembership('trial');
          setLoading(false);
        });

      return;
    });

    return ()=>{
      active=false;
    };
  },[]);

  async function logOut(){
    await supabase.auth.signOut();
    window.location.href='/';
  }

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

        {membership==='member' ? (
          <>
            <p>
              <strong>DOJO member</strong>
            </p>

            <p style={{marginBottom:0}}>
              Your membership includes continued access to
              DOJO's premium features without the trial
              allowances.
            </p>
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

            <p style={{marginBottom:0}}>
              Membership options will be available here.
            </p>
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