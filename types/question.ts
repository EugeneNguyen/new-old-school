export interface QuestionOption {
  label: string;
  description?: string;
}

export interface InteractiveQuestion {
  toolUseId: string;
  header?: string;
  question: string;
  options: QuestionOption[];
  multiSelect: boolean;
}
