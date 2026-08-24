import { useState } from 'react'

export function useWorkspaceBranchState(design: OmniDesignDocument) {
  const [separateBranch, setSeparateBranch] = useState(design.separateBranchMode)
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [manageBranchesOpen, setManageBranchesOpen] = useState(false)
  const [replyMessageId, setReplyMessageId] = useState<string | null>(design.replyMessageId)
  const [forkTarget, setForkTarget] = useState<DesignMessage | null>(null)
  const [forkSelectionKeys, setForkSelectionKeys] = useState<readonly string[]>([])
  const [removeBranchTarget, setRemoveBranchTarget] = useState<DesignBranch | null>(null)
  const [forceBranchRemoval, setForceBranchRemoval] = useState(false)
  const [lineageSelection, setLineageSelection] = useState<readonly string[]>([design.activeBranchId])
  const [revealedBranchRevisions, setRevealedBranchRevisions] = useState<Readonly<Record<string, readonly DesignRevision[]>>>({})
  const [branchComparison, setBranchComparison] = useState<BranchComparison | null>(null)
  const [branchComparisonTokens, setBranchComparisonTokens] = useState<{ readonly source: string; readonly destination: string } | null>(null)
  const [branchComparisonPage, setBranchComparisonPage] = useState<string | null>(null)
  const [combinationPrompt, setCombinationPrompt] = useState('')
  const [combinationAttempt, setCombinationAttempt] = useState<CombinationAttempt | null>(null)
  const [combinationHistory, setCombinationHistory] = useState<readonly CombinationAttempt[]>([])
  const [branchSummaries, setBranchSummaries] = useState<readonly BranchComparisonSummary[]>([])
  const [summarizingBranches, setSummarizingBranches] = useState(false)
  const [combinationPreview, setCombinationPreview] = useState<{ readonly token: string; readonly pages: readonly DesignPage[]; readonly entryPagePath: string | null } | null>(null)
  const [combiningBranches, setCombiningBranches] = useState(false)

  return {
    separateBranch, setSeparateBranch,
    creatingBranch, setCreatingBranch,
    manageBranchesOpen, setManageBranchesOpen,
    replyMessageId, setReplyMessageId,
    forkTarget, setForkTarget,
    forkSelectionKeys, setForkSelectionKeys,
    removeBranchTarget, setRemoveBranchTarget,
    forceBranchRemoval, setForceBranchRemoval,
    lineageSelection, setLineageSelection,
    revealedBranchRevisions, setRevealedBranchRevisions,
    branchComparison, setBranchComparison,
    branchComparisonTokens, setBranchComparisonTokens,
    branchComparisonPage, setBranchComparisonPage,
    combinationPrompt, setCombinationPrompt,
    combinationAttempt, setCombinationAttempt,
    combinationHistory, setCombinationHistory,
    branchSummaries, setBranchSummaries,
    summarizingBranches, setSummarizingBranches,
    combinationPreview, setCombinationPreview,
    combiningBranches, setCombiningBranches,
  }
}
