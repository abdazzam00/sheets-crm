export type Category =
  | 'Tech / SaaS / Software'
  | 'AI / Data'
  | 'Cybersecurity'
  | 'FinTech'
  | 'Banking / Capital Markets'
  | 'Private Equity / VC Portfolio Talent'
  | 'Insurance'
  | 'Healthcare Services'
  | 'Life Sciences / Biotech / Pharma'
  | 'Medical Devices / Diagnostics'
  | 'Industrial / Manufacturing'
  | 'Energy / Oil & Gas'
  | 'Renewables / Climate / Cleantech'
  | 'Infrastructure / Telecom / Data Centers'
  | 'Consumer / Retail / E-commerce'
  | 'CPG / Food & Beverage / Beauty'
  | 'Media / Entertainment / Sports'
  | 'Real Estate / Construction / PropTech'
  | 'Transportation / Logistics / Supply Chain'
  | 'Other / Unknown';

export type RecordRow = {
  id: string;
  companyName?: string;
  domain?: string;
  execSearchCategory?: Category;
  perplexityResearchNotes?: string;
  firmNiche?: string;
  executiveName?: string;
  executiveRole?: string;
  executiveLinkedIn?: string;
  email?: string;
  emailSource?: 'input' | 'inferred_from_email' | 'perplexity' | 'unknown';
  sourceFile?: string;
  sourceRow?: number;
  createdAt: string;
  updatedAt: string;
};
