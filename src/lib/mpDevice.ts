const MP_DEVICE_SCRIPT_ID = "rm-mp-security";
const MP_DEVICE_SCRIPT_SRC = "https://www.mercadopago.com/v2/security.js";
const MP_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_MP_DEVICE_ID_LENGTH = 256;
const MP_DEVICE_POLL_INTERVAL_MS = 50;
const MP_DEVICE_MAX_WAIT_MS = 1500;

type MPDeviceWindow = Window & { MP_DEVICE_SESSION_ID?: unknown };

function getMPDeviceWindow(): MPDeviceWindow | undefined {
  return typeof window === "undefined" ? undefined : window as MPDeviceWindow;
}

function isValidMPDeviceSessionId(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_MP_DEVICE_ID_LENGTH) {
    return false;
  }

  const match = value.match(MP_DEVICE_ID_PATTERN);
  return match?.[0] === value;
}

function readMPDeviceSessionId(): string | undefined {
  const deviceWindow = getMPDeviceWindow();
  const deviceId = deviceWindow?.MP_DEVICE_SESSION_ID;
  return isValidMPDeviceSessionId(deviceId) ? deviceId : undefined;
}

export function ensureMPDeviceScript(): void {
  const deviceWindow = getMPDeviceWindow();
  if (!deviceWindow || typeof document === "undefined" || readMPDeviceSessionId()) return;

  if (document.getElementById(MP_DEVICE_SCRIPT_ID)) return;

  try {
    const script = document.createElement("script");
    script.id = MP_DEVICE_SCRIPT_ID;
    script.src = MP_DEVICE_SCRIPT_SRC;
    script.setAttribute("view", "checkout");
    script.async = true;
    document.head.appendChild(script);
  } catch {
    // A blocked or unavailable script must not prevent checkout.
  }
}

export async function getMPDeviceSessionId(): Promise<string | undefined> {
  const currentId = readMPDeviceSessionId();
  if (currentId) return currentId;

  ensureMPDeviceScript();
  if (!getMPDeviceWindow() || typeof document === "undefined") return undefined;

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let elapsed = 0;

    const finish = (deviceId: string | undefined) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      resolve(deviceId);
    };

    const poll = () => {
      const deviceId = readMPDeviceSessionId();
      if (deviceId) {
        finish(deviceId);
        return;
      }
      if (elapsed >= MP_DEVICE_MAX_WAIT_MS) {
        finish(undefined);
        return;
      }

      elapsed += MP_DEVICE_POLL_INTERVAL_MS;
      timer = setTimeout(poll, MP_DEVICE_POLL_INTERVAL_MS);
    };

    poll();
  });
}
