export type ExecSearchStatus = 'unknown' | 'yes' | 'no';

export type RecordRow = {
  id: string;

  // Core table columns
  companyName: string;
  domain: string;
  execSearchCategory: string;
  execSearchStatus: ExecSearchStatus;
  perplexityResearchNotes: string;
  firmNiche: string;
  executiveName: string;
  executiveRole: string;
  executiveLinkedIn: string;
  email: string;
  emailTemplate: string;

  // System fields
  sourceFile: string;
  rawRowJson: string; // for debugging; not shown by default
  importBatchId: string;
  createdAt: string;
  updatedAt: string;
};

export const SHEET_COLUMNS: { key: keyof RecordRow; label: string; required?: boolean }[] = [
  { key: 'companyName', label: 'Company Name' },
  { key: 'domain', label: 'Domain' },
  { key: 'execSearchCategory', label: 'Exec Search Category (Perplexity)' },
  { key: 'execSearchStatus', label: 'Exec Search?' },
  { key: 'perplexityResearchNotes', label: 'Perplexity Research Notes' },
  { key: 'firmNiche', label: 'Firm Niche' },
  { key: 'executiveName', label: 'Executive Name' },
  { key: 'executiveRole', label: 'Executive Role' },
  { key: 'executiveLinkedIn', label: 'Executive LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'emailTemplate', label: 'Email Template' },
];
