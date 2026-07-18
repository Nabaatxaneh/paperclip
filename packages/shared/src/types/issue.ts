import type {
  IssueExecutionDecisionOutcome,
  IssueExecutionPolicyMode,
  IssueReferenceSourceKind,
  IssueExecutionStageType,
  IssueExecutionStateStatus,
  IssueOriginKind,
  IssuePriority,
  ModelProfileKey,
  IssueThreadInteractionContinuationPolicy,
  IssueThreadInteractionKind,
  IssueThreadInteractionStatus,
  IssueStatus,
} from "../constants.js";
import type { Goal } from "./goal.js";
import type { Project, ProjectWorkspace } from "./project.js";
import type { ExecutionWorkspace, IssueExecutionWorkspaceSettings } from "./workspace-runtime.js";
import type { IssueWorkProduct } from "./work-product.js";

export interface IssueAncestorProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  goalId: string | null;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
}

export interface IssueAncestorGoal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
}

export interface IssueAncestor {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
  goalId: string | null;
  project: IssueAncestorProject | null;
  goal: IssueAncestorGoal | null;
}

export interface IssueLabel {
  id: string;
  companyId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueAssigneeAdapterOverrides {
  modelProfile?: ModelProfileKey;
  adapterConfig?: Record<string, unknown>;
  useProjectWorkspace?: boolean;
}

export type DocumentFormat = "markdown";

export interface IssueDocumentSummary {
  id: string;
  companyId: string;
  issueId: string;
  key: string;
  title: string | null;
  format: DocumentFormat;
  latestRevisionId: string | null;
  latestRevisionNumber: number;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  updatedByAgentId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueDocument extends IssueDocumentSummary {
  body: string;
}

export interface DocumentRevision {
  id: string;
  companyId: string;
  documentId: string;
  issueId: string;
  key: string;
  revisionNumber: number;
  title: string | null;
  format: DocumentFormat;
  body: string;
  changeSummary: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface LegacyPlanDocument {
  key: "plan";
  body: string;
  source: "issue_description";
}

export interface IssueRelationIssueSummary {
  id: string;
  identifier: string | null;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  terminalBlockers?: IssueRelationIssueSummary[];
  /** True when the blocking relation was created by the system (recovery/automation), not a human or the blocked issue's own agent. */
  isSystemSpawned?: boolean;
}

export type IssueBlockerAttentionState =
  | "none"
  | "covered"
  | "stalled"
  | "parked_external"
  | "needs_attention";

export type IssueBlockerAttentionReason =
  | "active_child"
  | "active_dependency"
  | "stalled_review"
  | "external_actor"
  | "attention_required"
  | null;

/**
 * ALAA-1681 A1 requires a blocked issue to name a concrete external continuation
 * (an armed scheduled task, a clock gate, a human, a vendor). Blocker edges are
 * issue->issue only, so without this the policy-compliant park and the genuinely
 * abandoned issue are byte-identical to triage. See ALAA-2078.
 */
export const ISSUE_EXTERNAL_BLOCKER_KINDS = [
  "scheduled_task",
  "clock",
  "human",
  "vendor",
] as const;

export type IssueExternalBlockerKind = (typeof ISSUE_EXTERNAL_BLOCKER_KINDS)[number];

export interface IssueExternalBlocker {
  kind: IssueExternalBlockerKind;
  /** Identifier of the actor that owns the next action, e.g. a task name. */
  ref: string;
  /** When the external actor is expected to act. Null means "no known date". */
  eventAt: string | null;
  /** Server-stamped on write; anchors the TTL for a null-eventAt park. */
  setAt: string;
}

/**
 * A park with no known event date cannot be staleness-checked against `eventAt`,
 * so it escalates on a TTL measured from `setAt`. Without this, a null `eventAt`
 * would be a way to hide dead work forever — strictly worse than the mis-flag
 * this feature removes (ALAA-2078 AC3).
 */
export const ISSUE_EXTERNAL_BLOCKER_UNDATED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pure decision for AC1/AC3: is a zero-edge blocked issue legitimately parked on
 * an external actor, or does it need attention? Kept free of DB and clock access
 * so it is directly unit-testable.
 */
export function isIssueExternalBlockerActive(
  blocker: IssueExternalBlocker | null | undefined,
  now: Date,
): boolean {
  if (!blocker) return false;
  const nowMs = now.getTime();
  if (blocker.eventAt) {
    const eventMs = Date.parse(blocker.eventAt);
    // An unparseable date must not be treated as an indefinite park.
    if (Number.isNaN(eventMs)) return false;
    return eventMs > nowMs;
  }
  const setMs = Date.parse(blocker.setAt);
  if (Number.isNaN(setMs)) return false;
  return nowMs - setMs < ISSUE_EXTERNAL_BLOCKER_UNDATED_TTL_MS;
}

export interface IssueBlockerAttention {
  state: IssueBlockerAttentionState;
  reason: IssueBlockerAttentionReason;
  unresolvedBlockerCount: number;
  coveredBlockerCount: number;
  stalledBlockerCount: number;
  attentionBlockerCount: number;
  sampleBlockerIdentifier: string | null;
  sampleStalledBlockerIdentifier: string | null;
}

export type IssueProductivityReviewTrigger =
  | "no_comment_streak"
  | "long_active_duration"
  | "high_churn";

export interface IssueProductivityReview {
  reviewIssueId: string;
  reviewIdentifier: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  trigger: IssueProductivityReviewTrigger | null;
  noCommentStreak: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueRelation {
  id: string;
  companyId: string;
  issueId: string;
  relatedIssueId: string;
  type: "blocks";
  relatedIssue: IssueRelationIssueSummary;
}

export interface IssueReferenceSource {
  kind: IssueReferenceSourceKind;
  sourceRecordId: string | null;
  label: string;
  matchedText: string | null;
}

export interface IssueRelatedWorkItem {
  issue: IssueRelationIssueSummary;
  mentionCount: number;
  sources: IssueReferenceSource[];
}

export interface IssueRelatedWorkSummary {
  outbound: IssueRelatedWorkItem[];
  inbound: IssueRelatedWorkItem[];
}

export interface IssueExecutionStagePrincipal {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
}

export interface IssueExecutionStageParticipant extends IssueExecutionStagePrincipal {
  id: string;
}

export interface IssueExecutionStage {
  id: string;
  type: IssueExecutionStageType;
  approvalsNeeded: 1;
  participants: IssueExecutionStageParticipant[];
}

export interface IssueExecutionPolicy {
  mode: IssueExecutionPolicyMode;
  commentRequired: boolean;
  stages: IssueExecutionStage[];
}

export interface IssueReviewRequest {
  instructions: string;
}

export interface IssueExecutionState {
  status: IssueExecutionStateStatus;
  currentStageId: string | null;
  currentStageIndex: number | null;
  currentStageType: IssueExecutionStageType | null;
  currentParticipant: IssueExecutionStagePrincipal | null;
  returnAssignee: IssueExecutionStagePrincipal | null;
  reviewRequest: IssueReviewRequest | null;
  completedStageIds: string[];
  lastDecisionId: string | null;
  lastDecisionOutcome: IssueExecutionDecisionOutcome | null;
}

export interface IssueExecutionDecision {
  id: string;
  companyId: string;
  issueId: string;
  stageId: string;
  stageType: IssueExecutionStageType;
  actorAgentId: string | null;
  actorUserId: string | null;
  outcome: IssueExecutionDecisionOutcome;
  body: string;
  createdByRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  companyId: string;
  projectId: string | null;
  projectWorkspaceId: string | null;
  goalId: string | null;
  parentId: string | null;
  ancestors?: IssueAncestor[];
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  checkoutRunId: string | null;
  executionRunId: string | null;
  executionAgentNameKey: string | null;
  executionLockedAt: Date | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  issueNumber: number | null;
  identifier: string | null;
  originKind?: IssueOriginKind;
  originId?: string | null;
  originRunId?: string | null;
  originFingerprint?: string | null;
  requestDepth: number;
  billingCode: string | null;
  assigneeAdapterOverrides: IssueAssigneeAdapterOverrides | null;
  executionPolicy?: IssueExecutionPolicy | null;
  executionState?: IssueExecutionState | null;
  executionWorkspaceId: string | null;
  executionWorkspacePreference: string | null;
  executionWorkspaceSettings: IssueExecutionWorkspaceSettings | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  hiddenAt: Date | null;
  labelIds?: string[];
  labels?: IssueLabel[];
  blockedBy?: IssueRelationIssueSummary[];
  blocks?: IssueRelationIssueSummary[];
  blockerAttention?: IssueBlockerAttention;
  productivityReview?: IssueProductivityReview | null;
  relatedWork?: IssueRelatedWorkSummary;
  referencedIssueIdentifiers?: string[];
  planDocument?: IssueDocument | null;
  documentSummaries?: IssueDocumentSummary[];
  legacyPlanDocument?: LegacyPlanDocument | null;
  project?: Project | null;
  goal?: Goal | null;
  currentExecutionWorkspace?: ExecutionWorkspace | null;
  workProducts?: IssueWorkProduct[];
  mentionedProjects?: Project[];
  myLastTouchAt?: Date | null;
  lastExternalCommentAt?: Date | null;
  lastActivityAt?: Date | null;
  isUnreadForMe?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueComment {
  id: string;
  companyId: string;
  issueId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  followUpRequested?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueThreadInteractionActorFields {
  createdByAgentId?: string | null;
  createdByUserId?: string | null;
  resolvedByAgentId?: string | null;
  resolvedByUserId?: string | null;
}

export interface SuggestedTaskDraft {
  clientKey: string;
  parentClientKey?: string | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  priority?: IssuePriority | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  billingCode?: string | null;
  labels?: string[];
  hiddenInPreview?: boolean;
}

export interface SuggestTasksPayload {
  version: 1;
  defaultParentId?: string | null;
  tasks: SuggestedTaskDraft[];
}

export interface SuggestTasksResultCreatedTask {
  clientKey: string;
  issueId: string;
  identifier?: string | null;
  title?: string | null;
  parentIssueId?: string | null;
  parentIdentifier?: string | null;
}

export interface SuggestTasksResult {
  version: 1;
  createdTasks?: SuggestTasksResultCreatedTask[];
  skippedClientKeys?: string[];
  rejectionReason?: string | null;
}

export interface AskUserQuestionsQuestionOption {
  id: string;
  label: string;
  description?: string | null;
}

export interface AskUserQuestionsQuestion {
  id: string;
  prompt: string;
  helpText?: string | null;
  selectionMode: "single" | "multi";
  required?: boolean;
  options: AskUserQuestionsQuestionOption[];
}

export interface AskUserQuestionsPayload {
  version: 1;
  title?: string | null;
  submitLabel?: string | null;
  questions: AskUserQuestionsQuestion[];
}

export interface AskUserQuestionsAnswer {
  questionId: string;
  optionIds: string[];
}

export interface AskUserQuestionsResult {
  version: 1;
  answers: AskUserQuestionsAnswer[];
  cancelled?: true;
  cancellationReason?: string | null;
  summaryMarkdown?: string | null;
}

export interface RequestConfirmationIssueDocumentTarget {
  type: "issue_document";
  issueId?: string | null;
  documentId?: string | null;
  key: string;
  revisionId: string;
  revisionNumber?: number | null;
  label?: string | null;
  href?: string | null;
}

export interface RequestConfirmationCustomTarget {
  type: "custom";
  key: string;
  revisionId?: string | null;
  revisionNumber?: number | null;
  label?: string | null;
  href?: string | null;
}

export type RequestConfirmationTarget =
  | RequestConfirmationIssueDocumentTarget
  | RequestConfirmationCustomTarget;

export interface RequestConfirmationPayload {
  version: 1;
  prompt: string;
  acceptLabel?: string | null;
  rejectLabel?: string | null;
  rejectRequiresReason?: boolean;
  rejectReasonLabel?: string | null;
  allowDeclineReason?: boolean;
  declineReasonPlaceholder?: string | null;
  detailsMarkdown?: string | null;
  supersedeOnUserComment?: boolean;
  target?: RequestConfirmationTarget | null;
}

export interface RequestConfirmationResult {
  version: 1;
  outcome: "accepted" | "rejected" | "superseded_by_comment" | "stale_target";
  reason?: string | null;
  commentId?: string | null;
  staleTarget?: RequestConfirmationTarget | null;
}

export interface IssueThreadInteractionBase extends IssueThreadInteractionActorFields {
  id: string;
  companyId: string;
  issueId: string;
  kind: IssueThreadInteractionKind;
  idempotencyKey?: string | null;
  sourceCommentId?: string | null;
  sourceRunId?: string | null;
  title?: string | null;
  summary?: string | null;
  status: IssueThreadInteractionStatus;
  continuationPolicy: IssueThreadInteractionContinuationPolicy;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt?: Date | string | null;
}

export interface SuggestTasksInteraction extends IssueThreadInteractionBase {
  kind: "suggest_tasks";
  payload: SuggestTasksPayload;
  result?: SuggestTasksResult | null;
}

export interface AskUserQuestionsInteraction extends IssueThreadInteractionBase {
  kind: "ask_user_questions";
  payload: AskUserQuestionsPayload;
  result?: AskUserQuestionsResult | null;
}

export interface RequestConfirmationInteraction extends IssueThreadInteractionBase {
  kind: "request_confirmation";
  payload: RequestConfirmationPayload;
  result?: RequestConfirmationResult | null;
}

export type IssueThreadInteraction =
  | SuggestTasksInteraction
  | AskUserQuestionsInteraction
  | RequestConfirmationInteraction;

export type IssueThreadInteractionPayload =
  | SuggestTasksPayload
  | AskUserQuestionsPayload
  | RequestConfirmationPayload;

export type IssueThreadInteractionResult =
  | SuggestTasksResult
  | AskUserQuestionsResult
  | RequestConfirmationResult;

export interface IssueAttachment {
  id: string;
  companyId: string;
  issueId: string;
  issueCommentId: string | null;
  assetId: string;
  provider: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contentPath: string;
}
