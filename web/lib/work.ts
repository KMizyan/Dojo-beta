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
    console.error(
      'SUPABASE AUTH ERROR:',
      JSON.stringify(authError, null, 2)
    );
    throw new Error('You must be logged in to save your work.');
  }

  const { data: work, error: workError } = await supabase
    .from('work_items')
    .insert({
      user_id: auth.user.id,
      kind: input.kind ?? 'question_set',
      title: input.title,
      status: 'in_progress',
      settings: input.settings ?? {},
    })
    .select()
    .single();

  if (workError) {
    console.error(
      'SUPABASE WORK ERROR:',
      JSON.stringify(workError, null, 2)
    );
    throw workError;
  }

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
      console.error(
        'SUPABASE QUESTION ERROR:',
        JSON.stringify(questionError, null, 2)
      );

      await supabase
        .from('work_items')
        .delete()
        .eq('id', work.id);

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

  if (error) {
    console.error(
      'SUPABASE UPDATE ERROR:',
      JSON.stringify(error, null, 2)
    );
    throw error;
  }

  return data;
}