declare module 'expo-sharing' {
  export function shareAsync(url: string, options?: {
    dialogTitle?: string;
    mimeType?: string;
    UTI?: string;
    tintColor?: string;
  }): Promise<void>;
}
