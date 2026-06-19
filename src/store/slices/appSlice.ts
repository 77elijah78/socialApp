import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  theme: 'light' | 'dark';
  language: string;
  notificationsEnabled: boolean;
}

const initialState: AppState = {
  theme: 'dark',
  language: 'en',
  notificationsEnabled: true,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
    },
    toggleNotifications(state) {
      state.notificationsEnabled = !state.notificationsEnabled;
    },
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
    },
  },
});

export const { setTheme, toggleNotifications, setLanguage } = appSlice.actions;
export default appSlice.reducer;