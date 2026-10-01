import { supabase } from './supabase';

export type MembershipStatus = 'trial' | 'member';

export async function getMembershipStatus():
  Promise<MembershipStatus> {
  const { data, error } = await supabase.rpc(
    'get_membership'
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return row?.status === 'member'
    ? 'member'
    : 'trial';
}

export type TrialFeature =
  | 'generated_paper'
  | 'advanced_question_set'
  | 'ask_dojo_question';

export type TrialEntitlementResult = {
  allowed: boolean;
  consumed: boolean;
  used: number;
  allowance: number;
  remaining: number;
};

export type TrialEntitlementStatus = {
  feature: TrialFeature;
  used: number;
  allowance: number;
  remaining: number;
  exhausted: boolean;
};

export async function consumeTrialEntitlement(
  feature: TrialFeature,
  resourceKey: string
): Promise<TrialEntitlementResult> {
  const { data, error } = await supabase.rpc(
    'consume_trial_entitlement',
    {
      p_feature: feature,
      p_resource_key: resourceKey,
    }
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error('DOJO could not check your trial access.');
  }

  return {
    allowed: Boolean(row.allowed),
    consumed: Boolean(row.consumed),
    used: Number(row.used ?? 0),
    allowance: Number(row.allowance ?? 0),
    remaining: Number(row.remaining ?? 0),
  };
}

export async function releaseTrialEntitlement(
  feature: TrialFeature,
  resourceKey: string
): Promise<void> {
  const { error } = await supabase.rpc(
    'release_trial_entitlement',
    {
      p_feature: feature,
      p_resource_key: resourceKey,
    }
  );

  if (error) throw error;
}

export async function getTrialEntitlements():
  Promise<TrialEntitlementStatus[]> {
  const { data, error } = await supabase.rpc(
    'get_trial_entitlements'
  );

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    feature: row.feature as TrialFeature,
    used: Number(row.used ?? 0),
    allowance: Number(row.allowance ?? 0),
    remaining: Number(row.remaining ?? 0),
    exhausted: Boolean(row.exhausted),
  }));
}