import { NativeEventEmitter, NativeModules } from "react-native";
import {
  networkChargeFromStatus,
  type NetworkCharge,
} from "./AutoDownloadSettings";

export interface NetworkSnapshot {
  kind: NetworkCharge;
  type: string;
  isConnected: boolean;
  isRoaming: boolean;
}

type NativeNetworkStatus = {
  type?: string;
  isConnected?: boolean;
  isRoaming?: boolean;
};

const offline: NetworkSnapshot = {
  kind: "offline",
  type: "NONE",
  isConnected: false,
  isRoaming: false,
};

function normalize(status: NativeNetworkStatus): NetworkSnapshot {
  const type = status.type ?? "UNKNOWN";
  const isConnected = status.isConnected !== false && type !== "NONE";
  const isRoaming = Boolean(status.isRoaming);
  return {
    type,
    isConnected,
    isRoaming,
    kind: networkChargeFromStatus({ type, isConnected, isRoaming }),
  };
}

const nativeModule = (NativeModules as Record<string, unknown> | undefined)
  ?.CircleNetworkConditions as
  | {
      getStatus?: () => Promise<NativeNetworkStatus>;
    }
  | undefined;

type Subscription = { remove: () => void };
type Listener = () => void;

class NetworkStatusStore {
  private value = offline;
  private listeners = new Set<Listener>();
  private consumers = 0;
  private subscription: Subscription | null = null;
  private starting: Promise<void> | null = null;

  getSnapshot = () => this.value;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): () => void {
    this.consumers += 1;
    if (this.consumers === 1) void this.attach();
    return () => {
      this.consumers = Math.max(0, this.consumers - 1);
      if (this.consumers === 0) this.detach();
    };
  }

  refresh() {
    void this.attach();
  }

  private publish(next: NativeNetworkStatus) {
    const value = normalize(next);
    if (
      value.kind === this.value.kind &&
      value.type === this.value.type &&
      value.isConnected === this.value.isConnected &&
      value.isRoaming === this.value.isRoaming
    )
      return;
    this.value = value;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* one broken subscriber must not block connectivity updates */
      }
    }
  }

  private async attach() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      // Prefer our Android module because it also reports roaming. On iOS, web,
      // Expo Go and any build without the native module, expo-network remains
      // the portable source of truth.
      if (nativeModule?.getStatus) {
        try {
          const status = await nativeModule.getStatus();
          this.publish(status);
          if (!this.subscription && this.consumers > 0) {
            const emitter = new NativeEventEmitter(
              nativeModule as ConstructorParameters<typeof NativeEventEmitter>[0],
            );
            this.subscription = emitter.addListener(
              "CircleNetworkChange",
              (event: { status?: NativeNetworkStatus }) => {
                if (event?.status) this.publish(event.status);
                else this.refresh();
              },
            );
          }
          return;
        } catch {
          /* fall through to expo-network */
        }
      }
      try {
        const Network = await import("expo-network");
        const status = await Network.getNetworkStateAsync();
        this.publish({
          type: status.type,
          isConnected: status.isConnected,
          isRoaming: false,
        });
        if (!this.subscription && this.consumers > 0)
          this.subscription = Network.addNetworkStateListener((event) =>
            this.publish({
              type: event.type,
              isConnected: event.isConnected,
              isRoaming: false,
            }),
          );
      } catch {
        this.publish({ type: "NONE", isConnected: false, isRoaming: false });
      }
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private detach() {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export const networkStatus = new NetworkStatusStore();
