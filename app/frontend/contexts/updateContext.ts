import { createContext } from "react";

interface UpdateContext {
  /** The version of the available update (if any) */
  availableVersion: string | null;
  /** Whether an update is currently being checked */
  isCheckingUpdate: boolean;
  /** Whether an update is currently being applied */
  isApplyingUpdate: boolean;
  /** Check for updates manually */
  checkForUpdates: () => Promise<void>;
  /** Apply the available update (will restart app) */
  applyUpdate: () => Promise<void>;
  /** Dismiss the update notification temporarily */
  dismissUpdate: () => void;
  /** Whether the update notification has been dismissed */
  isDismissed: boolean;
}

const UpdateContextDefaults = (): UpdateContext => {
  return {
    availableVersion: null,
    isCheckingUpdate: false,
    isApplyingUpdate: false,
    checkForUpdates: async () => {},
    applyUpdate: async () => {},
    dismissUpdate: () => {},
    isDismissed: false,
  };
};

export const UpdateContext = createContext<UpdateContext>(
  UpdateContextDefaults()
);
