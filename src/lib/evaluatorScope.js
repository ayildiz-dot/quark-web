import { supabase } from './supabase'

// Returns scorecard visibility for an evaluator, based on their queue assignments.
//
// Two scopes:
//  - hubScorecardIds:       scorecards on the evaluator's EXACT assigned hubs
//  - workspaceScorecardIds: scorecards on ANY hub within the evaluator's workspaces
//
// Chain: user_queues -> queues.hub_id (their hubs)
//        -> hubs.workspace_id (their workspaces)
//        -> all hubs in those workspaces
//        -> scorecard_hubs for those hubs
//
// An evaluator with no queue/hub assignments gets empty lists (sees nothing).
export async function getEvaluatorScope(userId) {
  const empty = { hubIds: [], workspaceIds: [], hubScorecardIds: [], workspaceScorecardIds: [] }

  // 1. user's queues
  const { data: uq } = await supabase
    .from('user_queues').select('queue_id').eq('user_id', userId)
  const queueIds = (uq || []).map(r => r.queue_id)
  if (!queueIds.length) return empty

  // 2. those queues -> their hubs
  const { data: qrows } = await supabase
    .from('queues').select('hub_id').in('id', queueIds)
  const hubIds = [...new Set((qrows || []).map(r => r.hub_id).filter(Boolean))]
  if (!hubIds.length) return empty

  // 3. those hubs -> their workspaces
  const { data: hrows } = await supabase
    .from('hubs').select('id, workspace_id').in('id', hubIds)
  const workspaceIds = [...new Set((hrows || []).map(r => r.workspace_id).filter(Boolean))]

  // 4. ALL hubs within those workspaces (workspace-level expansion)
  let allWorkspaceHubIds = [...hubIds]
  if (workspaceIds.length) {
    const { data: wsHubs } = await supabase
      .from('hubs').select('id').in('workspace_id', workspaceIds)
    allWorkspaceHubIds = [...new Set((wsHubs || []).map(r => r.id))]
  }

  // 5. scorecards on the exact hubs, and on all workspace hubs
  const { data: hubLinks } = await supabase
    .from('scorecard_hubs').select('scorecard_id').in('hub_id', hubIds)
  const hubScorecardIds = [...new Set((hubLinks || []).map(r => r.scorecard_id))]

  const { data: wsLinks } = await supabase
    .from('scorecard_hubs').select('scorecard_id').in('hub_id', allWorkspaceHubIds)
  const workspaceScorecardIds = [...new Set((wsLinks || []).map(r => r.scorecard_id))]

  return { hubIds, workspaceIds, hubScorecardIds, workspaceScorecardIds }
}
