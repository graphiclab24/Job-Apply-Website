export type JobCategory = 'govt' | 'private' | 'ngo' | 'pharma' | 'brac' | 'foreign' | 'solution';
export type JobStatus = 'draft' | 'published' | 'scheduled';

export interface JobPostItem {
  name: string;
  count: number;
  district: 'ALL' | string;
  districts?: string[]; // Multiple allowed districts support
  applicationFee?: number;
  serviceCharge?: number;
}

export interface MediaSpec {
  width: number;
  height: number;
  maxKB: number;
}

export interface JobCircular {
  id: string;
  title: string;
  slug: string;
  category: JobCategory;
  content: string;
  hasCover?: boolean;
  circularLink?: string | null;
  featuredImage?: string | null;
  circularFile?: string | null;
  circularImages?: string[];
  deadline: any;
  applyLink: string;
  applyServiceEnabled: boolean;
  applicationFee: number;
  serviceCharge: number;
  photoSpec?: MediaSpec;
  signatureSpec?: MediaSpec;
  posts: JobPostItem[];
  // SEO & Social Optimization
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  tags?: string[];
  status: JobStatus;
  publishedAt?: any;
  createdAt: any;
  updatedAt: any;
}
