import { embedMessage } from "./discordMessage";
import { axiosTransport, type DeliveryResult, type DiscordTransport } from "./discordTransport";

/**
 * Settings "Send test": posted straight from the web request (not queued) so the user sees the
 * real Discord verdict — a deleted webhook answers 404 right there instead of minutes later.
 */
export function sendTestPing(url: string, transport: DiscordTransport = axiosTransport()): Promise<DeliveryResult> {
  return transport(
    url,
    embedMessage("Test notification from PoE2 Flip Assistant", [
      {
        title: "Webhook connected",
        description: "Alert types switched on for Discord in Settings → Notifications will arrive here.",
        color: 0x22c55e,
        fields: [],
      },
    ]),
  );
}
