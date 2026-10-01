'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthNav(){
  const [loggedIn,setLoggedIn]=useState(false);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{
      setLoggedIn(Boolean(data.user));
      setReady(true);
    });

    const {data:listener}=
      supabase.auth.onAuthStateChange((_event,session)=>{
        setLoggedIn(Boolean(session?.user));
        setReady(true);
      });

    return ()=>{
      listener.subscription.unsubscribe();
    };
  },[]);

  if(!ready) return null;

  if(!loggedIn){
    return (
      <>
        <Link href="/login">Log in</Link>
        <Link href="/signup">Create account</Link>
      </>
    );
  }

  return <Link href="/account">Account</Link>;
}