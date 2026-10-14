export interface PaymentSettings {
  bkashNumber: string;
  rocketNumber: string;
  nagadNumber?: string;
  instructions: string;
  whatsappNumber: string;
}

export interface ExamNotice {
  id: string;
  title: string;
  date: string;
  category: string;
  content: string;
  createdAt: any;
  updatedAt?: any;
}

export interface CounterRecord {
  count: number;
  dateKey: string;
}
