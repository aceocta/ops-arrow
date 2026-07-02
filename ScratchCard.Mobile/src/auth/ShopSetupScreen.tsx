import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { WebOnlyNotice } from "../components/WebOnlyNotice";
import { toastError, toastSuccess } from "../components/toast";
import { emailCompanySetupInfo } from "../api/companiesApi";
import { getApiErrorMessage } from "../utils/apiErrorMessage";
import { appInfo } from "../config/appInfo";

// Shops are created on the web platform only. A new company owner who has finished company setup but
// has no shop yet lands here: we point them to the web, then let them re-check (token + profile
// refresh) once they've created the shop there so the app can route them in. They can also email
// themselves the details + web link (handy for switching to a computer to finish setup).
export function ShopSetupScreen() {
  const { profile, refreshProfile, signOut, isLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const busy = isLoading || refreshing;
  const companyId = profile?.primaryCompanyId ?? null;

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

  async function onEmailInfo() {
    if (!companyId || emailing) return;
    setEmailing(true);
    try {
      await emailCompanySetupInfo(companyId);
      toastSuccess("Sent — check your email for the details and the web link.");
    } catch (error) {
      toastError(getApiErrorMessage(error, "Unable to send the email. Please try again."));
    } finally {
      setEmailing(false);
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
        {companyId ? (
          <PrimaryButton
            label={emailing ? "Sending…" : "Email me the details & link"}
            tone="neutral"
            icon="mail-outline"
            onPress={() => void onEmailInfo()}
            disabled={emailing || busy}
          />
        ) : null}
        <PrimaryButton label="Sign out" tone="neutral" onPress={() => void signOut()} disabled={busy} />
      </WebOnlyNotice>
    </ScreenContainer>
  );
}
