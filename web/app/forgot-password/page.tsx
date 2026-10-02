'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage(){
  const [email,setEmail]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const redirectTo=
      `${window.location.origin}/reset-password`;

    const {error}=
      await supabase.auth.resetPasswordForEmail(
        email,
        {redirectTo}
      );

    setLoading(false);

    if(error){
      setMessage(error.message);
      return;
    }

    setMessage(
      'If an account exists for that email, a password reset link has been sent.'
    );
  }

  return (
    <main className="page authPage">
      <h1>Reset your password</h1>

      <p>
        Enter your email and we'll send you a reset link.
      </p>

      <form onSubmit={submit}>
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

        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        <Link href="/login">Back to log in</Link>
      </p>
    </main>
  );
}