import { useQuery } from "@tanstack/react-query";
import { getConfigurations } from "../../api/configurationsApi";
import { useAuth } from "../../auth/AuthContext";

// Early/late/missed timing and the reading clock-time are shown only to a company owner (or platform
// admin) AND only while the matching shop setting is on. Used by the live log screen and the reports.
export function useTemperatureDisplaySettings() {
  const { activeShopId, profile } = useAuth();
  const configQuery = useQuery({
    queryKey: ["configurations", activeShopId],
    queryFn: () => getConfigurations(activeShopId as string),
    enabled: Boolean(activeShopId),
    staleTime: 10 * 60 * 1000,
  });

  const isCompanyOwner = (profile?.roles ?? []).some((r) => r === "CompanyOwner" || r === "PlatformAdmin");
  const valueOf = (key: string) => (configQuery.data ?? []).find((c) => c.configKey === key)?.configValue;

  return {
    showTiming: isCompanyOwner && valueOf("ShowTemperatureTimingStatus") !== "false",
    showReadingTime: isCompanyOwner && valueOf("ShowTemperatureReadingTime") !== "false",
  };
}
