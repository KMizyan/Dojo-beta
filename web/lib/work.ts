import { supabase } from './supabase';

type WorkStatus = 'in_progress' | 'completed' | 'marking' | 'marked';

export async function createWorkItem(input: {
  kind?: string;
  title: string;
  question_ids: string[];
  settings?: Record<string, unknown>;
}) {
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    throw new Error('You must be logged in to save your work.');
  }

  const { data: work, error: workError } = await supabase
    .from('work_items')
    .insert({
      user_id: auth.user.id,
      kind: input.kind ?? 'question_set',
      title: input.title,
      status: 'in_progress',
      settings: {
        ...(input.settings ?? {}),
        currentQuestion: 0,
      },
    })
    .select()
    .single();

  if (workError) throw workError;

  const questions = input.question_ids.map((questionId, position) => ({
    work_id: work.id,
    position,
    question_id: questionId,
  }));

  if (questions.length) {
    const { error: questionError } = await supabase
      .from('work_questions')
      .insert(questions);

    if (questionError) {
      await supabase.from('work_items').delete().eq('id', work.id);
      throw questionError;
    }
  }

  return {
    ...work,
    question_ids: input.question_ids,
  };
}

export async function updateWorkItem(
  id: string,
  status: WorkStatus
) {
  const { data, error } = await supabase
    .from('work_items')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateWorkProgress(
  id: string,
  currentQuestion: number
) {
  const { data: existing, error: readError } = await supabase
    .from('work_items')
    .select('settings')
    .eq('id', id)
    .single();

  if (readError) throw readError;

  const { data, error } = await supabase
    .from('work_items')
    .update({
      settings: {
        ...(existing?.settings ?? {}),
        currentQuestion,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return data;
}