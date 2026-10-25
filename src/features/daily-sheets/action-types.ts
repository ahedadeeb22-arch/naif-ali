export interface MutationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface OpenDraftResult {
  sheetId: string;
  revisionId: string;
  version: number;
  status: string;
}
