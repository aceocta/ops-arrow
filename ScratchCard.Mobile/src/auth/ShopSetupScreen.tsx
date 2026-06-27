import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { WebOnlyNotice } from "../components/WebOnlyNotice";
import { appInfo } from "../config/appInfo";

// Shops are created on the web platform only. A new company owner who has finished company setup but
// has no shop yet lands here: we point them to the web, then let them re-check (token + profile
// refresh) once they've created the shop there so the app can route them in.
export function ShopSetupScreen() {
  const { refreshProfile, signOut, isLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const busy = isLoading || refreshing;

  async function onRefresh() {
    setRefreshing(true);
    try {
      // Rotate the token so the freshly-created shop's membership/claims are picked up.
      await refreshProfile(null, true);
    } catch {
      // Best-effort: if the shop isn't there yet the user simply stays on this screen.
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScreenContainer>
      <WebOnlyNotice
        title="Create your shop on the web"
        message={`Almost there! Shops are set up on the ${appInfo.name} web platform. Create your first shop there, then tap “I’ve created my shop” to continue.`}
      >
        <PrimaryButton
          label={busy ? "Checking…" : "I’ve created my shop"}
          icon="refresh-outline"
          onPress={() => void onRefresh()}
          disabled={busy}
        />
        <PrimaryButton label="Sign out" tone="neutral" onPress={() => void signOut()} disabled={busy} />
      </WebOnlyNotice>
    </ScreenContainer>
  );
}
