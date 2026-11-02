import { withoutLegacyActivity } from "@/services/NotificationService";
// store/index.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ← real storage

import authReducer from './slices/authSlice';
import appReducer from './slices/appSlice';
import notificationsReducer from './slices/notificationsSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  app: appReducer,
  notifications: notificationsReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'app'],
  // Drop unscoped legacy notifications on upgrade, without a new startup request.
  migrate: async (state: import('redux-persist').PersistedState) => withoutLegacyActivity(state),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;