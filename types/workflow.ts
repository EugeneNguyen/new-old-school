export interface Workflow {
  id: string;
  name: string;
}

export interface Stage {
  name: string;
  description?: string;
  prompt?: string | null;
  autoAdvanceOnComplete?: boolean | null;
  agentId?: string | null;
  // Positive integer limit on how many items to render in the column.
  // `0`, `null`, or absent all mean "no limit".
  maxDisplayItems?: number | null;
}

export type ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed';

export interface ItemSession {
  stage: string;
  adapter: string;
  sessionId: string;
  startedAt: string;
  agentId?: string;
}

export interface WorkflowItem {
  id: string;
  title: string;
  stage: string;
  status: ItemStatus;
  comments?: string[];
  body?: string;
  sessions?: ItemSession[];
  updatedAt: string;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  stages: Stage[];
  items: WorkflowItem[];
}

export interface Agent {
  id: string;
  displayName: string;
  adapter: string | null;
  model: string | null;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}
