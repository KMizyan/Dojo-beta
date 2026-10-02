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

export default function SignupPage(){
  const [next,setNext]=useState('/');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const [created,setCreated]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    setNext(safeNext(params.get('next')));
  },[]);

  async function signUp(e:FormEvent){
    e.preventDefault();
    setMessage('');

    if(password.length < 8){
      setMessage(
        'Use a password with at least 8 characters.'
      );
      return;
    }

    if(password !== confirmPassword){
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    const emailRedirectTo=
      `${window.location.origin}${next}`;

    const {data,error}=await supabase.auth.signUp({
      email,
      password,
      options:{
        emailRedirectTo
      }
    });

    setLoading(false);

    if(error){
      setMessage(error.message);
      return;
    }

    if(data.session){
      window.location.href=next;
      return;
    }

    setCreated(true);
    setMessage(
      'Account created. Check your email to confirm your account.'
    );
  }

  const loginHref=
    `/login?next=${encodeURIComponent(next)}`;

  return (
    <main className="page authPage">
      <h1>Create your DOJO account</h1>

      {!created && (
        <form onSubmit={signUp}>
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
              autoComplete="new-password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div>
            <label htmlFor="confirm-password">
              Confirm password
            </label>
            <br />
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e=>setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      )}

      {message && <p>{message}</p>}

      <p>
        Already have an account?{' '}
        <Link href={loginHref}>
          Log in
        </Link>
      </p>
    </main>
  );
}