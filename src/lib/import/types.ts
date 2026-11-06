export const IMPORT_PAGE_SIZE = 10;

export type ImportAccount = {
  id: string;
  login: string;
  type: string;
  avatarUrl: string | null;
  repoCount: number;
};

export type ImportRepo = {
  id: string;
  fullName: string;
  name: string;
  suggestedSubdomain: string;
  private: boolean;
  pushedAt: string | null;
  imported: boolean;
  archived: boolean;
};

export type ImportView = {
  connected: boolean;
  accounts: ImportAccount[];
  selectedAccountId: string | null;
  repos: ImportRepo[];
  total: number;
  page: number;
  query: string;
  hasNext: boolean;
  isFirstSite: boolean;
};
