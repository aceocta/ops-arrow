using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public abstract class ComplianceCheckEntry : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid ComplianceCheckItemId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public ComplianceCheckResult Result { get; set; } = ComplianceCheckResult.Pending;
    public string? Notes { get; set; }
    public string? ActionRequired { get; set; }
    public Guid? CheckedByUserId { get; set; }
    public string? CheckedByName { get; set; }
    public DateTimeOffset? CheckedOn { get; set; }
    public bool IsActionClosedOut { get; set; }
    public string? ClosedOutNotes { get; set; }
    public Guid? ClosedOutByUserId { get; set; }
    public string? ClosedOutByName { get; set; }
    public DateTimeOffset? ClosedOutOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public ComplianceCheckItem ComplianceCheckItem { get; set; } = null!;

    public abstract DateOnly PeriodStartDate { get; }
    public abstract DateOnly PeriodEndDate { get; }
    public virtual DateOnly PeriodDate => PeriodStartDate;
    public virtual string PeriodLabel => PeriodStartDate == PeriodEndDate
        ? PeriodStartDate.ToString("yyyy-MM-dd")
        : $"{PeriodStartDate:yyyy-MM-dd} to {PeriodEndDate:yyyy-MM-dd}";
    public virtual string? MonthName => null;
    public virtual int? MonthNumber => null;
    public virtual int? MonthYear => null;
}

public sealed class DailyComplianceCheckEntry : ComplianceCheckEntry
{
    public DateOnly CheckDate { get; set; }

    public override DateOnly PeriodStartDate => CheckDate;
    public override DateOnly PeriodEndDate => CheckDate;

    public DailyComplianceCheckEntry()
    {
        Frequency = ComplianceCheckFrequency.Daily;
    }
}

public sealed class WeeklyComplianceCheckEntry : ComplianceCheckEntry
{
    public DateOnly WeekStartDate { get; set; }
    public DateOnly WeekEndDate { get; set; }

    public override DateOnly PeriodStartDate => WeekStartDate;
    public override DateOnly PeriodEndDate => WeekEndDate;

    public WeeklyComplianceCheckEntry()
    {
        Frequency = ComplianceCheckFrequency.Weekly;
    }
}

public sealed class MonthlyComplianceCheckEntry : ComplianceCheckEntry
{
    public DateOnly MonthStartDate { get; set; }
    public DateOnly MonthEndDate { get; set; }
    public string MonthNameValue { get; set; } = string.Empty;
    public int MonthNumberValue { get; set; }
    public int MonthYearValue { get; set; }

    public override DateOnly PeriodStartDate => MonthStartDate;
    public override DateOnly PeriodEndDate => MonthEndDate;
    public override string? MonthName => MonthNameValue;
    public override int? MonthNumber => MonthNumberValue;
    public override int? MonthYear => MonthYearValue;
    public override string PeriodLabel => string.IsNullOrWhiteSpace(MonthNameValue)
        ? $"{MonthStartDate:yyyy-MM-dd} to {MonthEndDate:yyyy-MM-dd}"
        : $"{MonthNameValue} {MonthYearValue}";

    public MonthlyComplianceCheckEntry()
    {
        Frequency = ComplianceCheckFrequency.Monthly;
    }
}
