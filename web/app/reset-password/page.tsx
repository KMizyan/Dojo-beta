'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage(){
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const [complete,setComplete]=useState(false);

  async function submit(e:FormEvent){
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

    const {error}=await supabase.auth.updateUser({
      password
    });

    setLoading(false);

    if(error){
      setMessage(
        'This reset link is invalid or has expired. Request a new one.'
      );
      return;
    }

    setComplete(true);
    setMessage('Your password has been updated.');
  }

  return (
    <main className="page">
      <h1>Choose a new password</h1>

      {!complete && (
        <form onSubmit={submit}>
          <div>
            <label htmlFor="password">
              New password
            </label>
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
              Confirm new password
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
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      )}

      {message && <p>{message}</p>}

      {complete && (
        <p>
          <Link href="/">Continue to DOJO</Link>
        </p>
      )}
    </main>
  );
}