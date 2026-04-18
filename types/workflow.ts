export interface Workflow {
  id: string;
  name: string;
}

export interface Stage {
  name: string;
  description?: string;
  prompt?: string | null;
  autoAdvanceOnComplete?: boolean | null;
}

export type ItemStatus = 'Todo' | 'In Progress' | 'Done';

export interface ItemSession {
  stage: string;
  adapter: string;
  sessionId: string;
  startedAt: string;
}

export interface WorkflowItem {
  id: string;
  title: string;
  stage: string;
  status: ItemStatus;
  comments?: string[];
  body?: string;
  sessions?: ItemSession[];
}

export interface WorkflowDetail {
  id: string;
  name: string;
  stages: Stage[];
  items: WorkflowItem[];
}
