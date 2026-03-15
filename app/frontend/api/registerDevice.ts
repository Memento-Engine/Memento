import { notify } from "@/lib/notify";
import { invoke } from "@tauri-apps/api/core";
import {
  DeviceMetaData,
  GatewayResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  registerDeviceResponseSchema,
} from "@shared/types/gateway";
import { AI_GATEWAY_BASE_URL } from "./base";

import { type, version, hostname } from "@tauri-apps/plugin-os";
import { getVersion } from "@tauri-apps/api/app";
import { 
  getPassword, 
  setPassword, 
  deletePassword 
} from "tauri-plugin-keyring-api";
async function getDeviceMetadata(): Promise<DeviceMetaData> {
  try {
    // 1. Get OS Info (Synchronous)
    const osType = type(); // e.g., 'windows', 'macos', 'linux'
    const osVersion = version(); // e.g., '10.0.22631'

    // 2. Get Hostname & App Version (Asynchronous)
    const machineHostname = await hostname(); // e.g., 'DESKTOP-ABC1234'
    const appVersion = await getVersion(); // e.g., '1.0.0' (from tauri.conf.json)

    return {
      os: `${osType} ${osVersion}`,
      appVersion: appVersion,
      machineHostName: machineHostname || "Unknown",
    };
  } catch (error) {
    console.error("Failed to fetch device metadata:", error);
    throw error;
  }
}

export const registerDevice = async () => {
  let deviceMetaData: DeviceMetaData;
  try {
    deviceMetaData = await getDeviceMetadata();
  } catch (err) {
    notify.error(
      "Failed to Register the device. Please try again after some time.",
    );
    throw err;
  }

  try {
    const [deviceId, timeStamp, signature] = await invoke<
      [string, string, string]
    >("generate_auth_headers");

    console.log("SecureData", { deviceId, timeStamp, signature });

    const payload: RegisterDeviceRequest = {
      deviceId,
      deviceMetaData,
      signature,
      timestamp: timeStamp,
    };

    console.log("Registering device with payload:", payload);

    const response = await fetch(`${AI_GATEWAY_BASE_URL}/registerDevice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const gatewayResponse: GatewayResponse<RegisterDeviceResponse> =
      await response.json();

    const parsedDevice = registerDeviceResponseSchema.safeParse(gatewayResponse.data);

    if (!parsedDevice.success) {
      console.error("Invalid gateway response format", gatewayResponse);
      throw new Error("Invalid gateway response format");
    }

    const { accessToken, refreshToken } = parsedDevice.data;

    if (!accessToken || !refreshToken) {
      console.log("Access token or refresh token missed");
      throw new Error(
        "Access token or refresh token not received from gateway",
      );
    }
    console.log("Received access token:", accessToken);
    console.log("Received refresh token:", refreshToken);

    // Save device ID to localStorage for future requests
    localStorage.setItem("deviceId", deviceId);

    await setPassword("memento-ai", "device-token", refreshToken);
    document.cookie = `accessToken=${accessToken}; path=/; secure; samesite=strict`;
    notify.success("Device registered successfully!");
  } catch (error) {
    console.error("Error registering device:", error);
    if (error instanceof TypeError && error.message.includes("Network")) {
      notify.error(
        "Network error: Please ensure the backend server is running and accessible.",
      );
    } else if (error instanceof SyntaxError) {
      notify.error("Unexpected server response. Please try again later.");
    } else if (error instanceof Error) {
      notify.error(`Registration failed. Please try again`);
    } else {
      notify.error("An unknown error occurred during device registration.");
    }
    throw error;
  }
};
