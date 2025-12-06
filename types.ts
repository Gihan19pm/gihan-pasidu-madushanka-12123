export interface Deposit {
  id: number | string;
  amount: number;
  name: string;
  timestamp: string;
}

export interface AppData {
  currentAmount: number;
  goalAmount: number;
  donorCount: number;
  recentDeposits: Deposit[];
}

export interface NotificationState {
  message: string;
  type: 'success' | 'error';
}

export type ViewState = 'public' | 'login' | 'admin';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}