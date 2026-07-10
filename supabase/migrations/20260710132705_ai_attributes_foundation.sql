-- AI Attributes foundation (Phase 1 of 5).
-- Purely additive: new nullable/defaulted columns only. Nothing existing changes
-- behavior until Phase 2 (ScorecardBuilder authoring UI) starts setting these.

-- Quality scorecard questions: mark a question as AI-scored, and store the
-- admin-authored prompt that tells Gemini how to evaluate it.
alter table scorecard_questions
  add column if not exists is_ai_attribute boolean not null default false,
  add column if not exists ai_prompt text;

-- Per-question scores: keep the AI's original suggestion + reasoning alongside
-- the evaluator's final answer, so accuracy (final == ai_suggested) can be computed
-- later without guessing what the AI originally said.
alter table evaluation_scores
  add column if not exists ai_suggested_score text,
  add column if not exists ai_reasoning text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluation_scores_ai_suggested_score_check'
  ) then
    alter table evaluation_scores
      add constraint evaluation_scores_ai_suggested_score_check
      check (ai_suggested_score is null or ai_suggested_score in ('pass', 'fail', 'na'));
  end if;
end $$;

-- DSAT (BPO DSAT Scorecard, Phase 4): mirrors the existing deviated_controllability /
-- is_deviated / deviation_source_evaluation_id pattern already used for Vendor-vs-KG
-- spot-check reconciliation, but for AI-vs-evaluator instead.
alter table evaluations
  add column if not exists ai_suggested_controllability text,
  add column if not exists ai_controllability_reasoning text,
  add column if not exists is_ai_deviated boolean;
