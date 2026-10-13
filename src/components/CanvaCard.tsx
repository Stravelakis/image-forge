/**
 * Settings → Canva: connect your own Canva account (13 Oct 2026).
 * The steps are on screen, in plain words, because Canva's developer portal
 * is the one place in the app's setup that is not one click.
 */
import { useEffect, useState } from "react";
import type { ForgeSettings } from "../lib/providers";
import { canvaConnect, canvaDisconnect, canvaStatus } from "../lib/canva";

export function CanvaCard({ settings, patchSettings }: { settings: ForgeSettings; patchSettings: (p: Partial<ForgeSettings>) => void }) {
  const [state, setState] = useState<{ connected: boolean; name?: string; redirectUri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const check = () => void canvaStatus(settings).then(setState).catch((e) => setNote(String(e.message ?? e)));
  useEffect(check, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Signing in happens in your browser; look again when you come back.
  useEffect(() => {
    const on = () => busy && check();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  });
  const field = "w-full rounded-lg border border-line bg-[var(--color-field)] px-3 py-2 text-[13px] text-cream";
  const set = (p: Partial<ForgeSettings["canva"]>) => patchSettings({ canva: { ...settings.canva, ...p } });
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="font-display text-2xl text-cream">Canva</h2>
      <p className="text-[13.5px] text-parch">
        Send your pictures straight into Canva, and fill your Canva templates from a list — one finished design per row,
        back here in Made. Works with Canva Pro, Teams, Education and Nonprofits (filling templates needs one of those; sending
        pictures works on any plan).
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-parch">
        <li>
          Open{" "}
          <a className="underline" href="https://www.canva.com/developers/integrations/connect-api" target="_blank" rel="noreferrer" data-tip="Canva's page for your own connections. Opens in your browser.">
            Canva's developer page
          </a>{" "}
          and create an integration (any name, e.g. “My Image Forge”).
        </li>
        <li>
          Under <b>Authentication</b>, add this as the redirect URL:{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-[12px] text-cream">{state?.redirectUri ?? "http://127.0.0.1:47821/canva/callback"}</code>
        </li>
        <li>Under <b>Scopes</b>, tick: assets read + write, designs read + write, brand templates read, profile read.</li>
        <li>Copy the <b>Client ID</b> and generate a <b>Client secret</b>, paste them below, press Connect and say yes in Canva.</li>
      </ol>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={field} placeholder="Client ID" value={settings.canva.clientId} onChange={(e) => set({ clientId: e.target.value })} data-tip="Your integration's Client ID, from Canva's developer page." />
        <input className={field} type="password" placeholder="Client secret" value={settings.canva.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} data-tip="Your integration's secret. Kept on this computer, locked." />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="forge-primary px-5 py-2 text-[13px] text-[var(--color-on-accent)]"
          disabled={!settings.canva.clientId || !settings.canva.clientSecret}
          onClick={async () => {
            setBusy(true);
            setNote("");
            try {
              await canvaConnect(settings);
              setNote("Your browser opened Canva — say yes there, then come back here.");
            } catch (e) {
              setNote(String((e as Error).message));
            }
          }}
          data-tip="Opens Canva in your browser to ask for your yes. Once only."
        >
          {state?.connected ? "Connect again" : "Connect to Canva"}
        </button>
        {state?.connected && (
          <button className="forge-ghost px-4 py-2 text-[13px] text-parch" onClick={() => void canvaDisconnect(settings).then(check)} data-tip="Forget the Canva sign-in on this computer.">
            Disconnect
          </button>
        )}
        <span className="text-[13px] text-parch">{state?.connected ? `✓ Connected${state.name ? ` as ${state.name}` : ""}` : "Not connected"}</span>
      </div>
      {note && <p className="text-[12.5px] text-dust">{note}</p>}
    </div>
  );
}
