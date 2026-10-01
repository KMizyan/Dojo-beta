'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

function safeNext(value:string|null){
  if(
    value &&
    value.startsWith('/') &&
    !value.startsWith('//')
  ){
    return value;
  }

  return '/';
}

export default function LoginPage(){
  const [next,setNext]=useState('/');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setNext(safeNext(params.get('next')));
  },[]);

  async function signIn(e:FormEvent){
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const {error}=await supabase.auth.signInWithPassword({
      email,
      password
    });

    if(error){
      setLoading(false);
      setMessage(error.message);
      return;
    }

    window.location.href=next;
  }

  const signupHref=
    `/signup?next=${encodeURIComponent(next)}`;

  return (
    <main className="page">
      <h1>Log in to DOJO</h1>

      <form onSubmit={signIn}>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        <Link href="/forgot-password">
          Forgot password?
        </Link>
      </p>

      <p>
        New to DOJO?{' '}
        <Link href={signupHref}>
          Create an account
        </Link>
      </p>
    </main>
  );
}