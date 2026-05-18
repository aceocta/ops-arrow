using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Seed;

public static class ComplianceCheckSeedDefaults
{
    public static IReadOnlyCollection<ComplianceCheckSeedDefinition> Definitions { get; } =
    [
        new(ComplianceCheckFrequency.Daily, "Fire & Emergency", "Fire extinguishers available and accessible with no pressure loss"),
        new(ComplianceCheckFrequency.Daily, "Fire & Emergency", "Condemned fire extinguishers removed from use"),
        new(ComplianceCheckFrequency.Daily, "Fire & Emergency", "Fire buckets in position and filled with dry absorbent material"),
        new(ComplianceCheckFrequency.Daily, "Fire & Emergency", "Clear access to external fireman switch"),
        new(ComplianceCheckFrequency.Daily, "Fire & Emergency", "Clear access to fire exits and routes"),
        new(ComplianceCheckFrequency.Daily, "Site Safety", "Flammable materials in litter bins or waste containers controlled"),
        new(ComplianceCheckFrequency.Daily, "Site Safety", "Telephones working including DCD box where applicable"),
        new(ComplianceCheckFrequency.Daily, "Site Safety", "PA system and microphone audible and staff understand operation"),
        new(ComplianceCheckFrequency.Daily, "Fuel & Forecourt", "No visible leaks on pumps or nozzles and no petrol smell on site"),
        new(ComplianceCheckFrequency.Daily, "Fuel & Forecourt", "Tanks checked for water ingress"),
        new(ComplianceCheckFrequency.Daily, "Fuel & Forecourt", "Tank fill pipes secure and labels legible"),
        new(ComplianceCheckFrequency.Daily, "Fuel & Forecourt", "Daily wet stock reconciliation completed and losses not excessive"),
        new(ComplianceCheckFrequency.Daily, "People & Hygiene", "Emergency procedures displayed and staff aware"),
        new(ComplianceCheckFrequency.Daily, "People & Hygiene", "Contractors and visitors record available and up to date"),
        new(ComplianceCheckFrequency.Daily, "People & Hygiene", "Trip hazards controlled including shop displays"),
        new(ComplianceCheckFrequency.Daily, "People & Hygiene", "Public and staff toilets clean and correctly equipped"),
        new(ComplianceCheckFrequency.Daily, "People & Hygiene", "COSHH safety data sheets available and staff aware"),
        new(ComplianceCheckFrequency.Daily, "Security", "Silent personal attack button indicates set"),
        new(ComplianceCheckFrequency.Daily, "Supervisor Sign Off", "Daily check sheet reviewed by competent staff", null, true),

        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food storage temperature check - line 1"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food storage temperature check - line 2"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food storage temperature check - line 3"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food storage temperature check - line 4"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food storage temperature check - line 5"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food expiry date code check - line 6"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food expiry date code check - line 7"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food expiry date code check - line 8"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food expiry date code check - line 9"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Food expiry date code check - line 10"),
        new(ComplianceCheckFrequency.Daily, "Food Safety", "Chilled food deliveries checked"),

        new(ComplianceCheckFrequency.Weekly, "Forecourt", "External ignition warning signs in position and good condition"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "All external safety signs in position and good condition"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "External slips, trips, falls and poorly seated manhole cover risks controlled"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "Tanker controls such as cones available"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "Pumps, stanchions and island trim in safe condition"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "Car or jet wash bay and forecourt services in safe condition"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "Manhole covers can be safely lifted with walking stick key"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "Manhole safety labels present and legible"),
        new(ComplianceCheckFrequency.Weekly, "Forecourt", "All areas safe and well lit"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Internal fire exit and safety signs in position and condition"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Internal slips, trips and falls risks controlled"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Health and safety notice board visible and in good condition"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "First aid kit stocked, clean and available"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Food storage and display areas clean with no cross contamination risk"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Food hygiene controls in position and records completed"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Daily health and safety checks completed"),
        new(ComplianceCheckFrequency.Weekly, "Store Safety", "Accident book available and incidents followed up"),
        new(ComplianceCheckFrequency.Weekly, "Supervisor Sign Off", "Weekly check sheet reviewed by supervisor", null, true),

        new(ComplianceCheckFrequency.Monthly, "Documentation", "Safe operations manual accessible and up to date"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Staff training record up to date"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Staff awareness record completed and signed"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Petroleum license in date and available"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Tanker delivery certificates filed, completed and signed"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Tanker delivery procedure complies with DSEAR assessment"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Electrical test certificate available and in date"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Portable appliance testing records available and in date"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Fire drill completed in the last three months"),
        new(ComplianceCheckFrequency.Monthly, "Documentation", "Interceptor service and cleaning on schedule"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Risk assessment review and safety audit completed"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Fire extinguishers in date, pressurised and clearly signed"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Site walkthrough completed for hazards, hygiene, lighting and safety signs"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Hazardous substances stored safely and identified"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Staff security and cash security procedures checked"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "All fire extinguishers serviced within current 12 month period"),
        new(ComplianceCheckFrequency.Monthly, "Operational Safety", "Manual handling safety checks completed for key tasks"),
        new(ComplianceCheckFrequency.Monthly, "Supervisor Sign Off", "Monthly check sheet reviewed by operator", null, true)
    ];
}

public sealed record ComplianceCheckSeedDefinition(
    ComplianceCheckFrequency Frequency,
    string GroupName,
    string ItemName,
    string? Description = null,
    bool IsRequired = true);
