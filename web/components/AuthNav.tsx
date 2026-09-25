'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthNav() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function logOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (!ready) return null;

  if (!email) {
    return <Link href="/login">Log in</Link>;
  }

  return (
    <>
      <span>{email}</span>
      <button type="button" onClick={logOut}>Log out</button>
    </>
  );
}