export type PaymentMethod = 'bkash' | 'rocket' | 'nagad';

export interface PaymentDetails {
  method: PaymentMethod;
  senderNumber: string;
  hasScreenshot?: boolean;
  screenshotPath?: string;
  screenshotUrl?: string;
  verified: boolean;
  verifiedAt?: any;
  verifiedBy?: string;
}
