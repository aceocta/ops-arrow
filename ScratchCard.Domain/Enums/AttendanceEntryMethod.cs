namespace ScratchCard.Domain.Enums;

public enum AttendanceEntryMethod
{
    Clocked = 1, // tapped check in/out on the device (auto-approved)
    Manual = 2,  // times entered by hand (pending manager approval unless a manager entered them)
}
