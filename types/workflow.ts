export interface Workflow {
  id: string;
  name: string;
  idPrefix: string;
  routineEnabled?: boolean;
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
  // Slash command / skill name to inject into the agent prompt on session start.
  // Stored bare (no leading `/`), injected as `/<skill>` in the prompt.
  skill?: string | null;
}

export type ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed';

export interface ItemSession {
  stage: string;
  adapter: string;
  sessionId: string;
  startedAt: string;
  agentId?: string;
}

export interface Comment {
  text: string;
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface WorkflowItem {
  id: string;
  title: string;
  stage: string;
  status: ItemStatus;
  comments?: Comment[];
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
