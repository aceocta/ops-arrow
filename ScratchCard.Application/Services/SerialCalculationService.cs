using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class SerialCalculationService : ISerialCalculationService
{
    private static SellingOrder NormalizeSellingOrder(SellingOrder sellingOrder) =>
        sellingOrder == (SellingOrder)0 ? SellingOrder.Ascending : sellingOrder;

    public ShiftSaleCalculationResult Calculate(
        string openingSerial,
        string closingSerial,
        string startSerial,
        string endSerial,
        SellingOrder sellingOrder,
        decimal ticketPrice,
        int totalTickets)
    {
        if (!int.TryParse(openingSerial, out var opening) ||
            !int.TryParse(closingSerial, out var closing) ||
            !int.TryParse(startSerial, out var start) ||
            !int.TryParse(endSerial, out var end))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        var min = Math.Min(start, end);
        var max = Math.Max(start, end);

        if (closing < min || closing > max || opening < min || opening > max)
        {
            throw new AppException(ErrorCodes.ClosingSerialOutOfRange, "Closing serial is outside pack range.");
        }

        var normalizedSellingOrder = NormalizeSellingOrder(sellingOrder);

        var sold = normalizedSellingOrder switch
        {
            SellingOrder.Ascending when closing < opening => throw new AppException(ErrorCodes.InvalidSellingOrderSequence, "Closing serial cannot be lower than opening serial for ascending packs."),
            SellingOrder.Descending when closing > opening => throw new AppException(ErrorCodes.InvalidSellingOrderSequence, "Closing serial cannot be higher than opening serial for descending packs."),
            SellingOrder.Ascending => closing - opening,
            SellingOrder.Descending => opening - closing,
            _ => throw new AppException(ErrorCodes.InvalidSellingOrderSequence, "Unsupported selling order.")
        };

        if (sold < 0 || sold > totalTickets)
        {
            throw new AppException(ErrorCodes.InvalidSellingOrderSequence, "Sold quantity is out of allowed range.");
        }

        var remaining = normalizedSellingOrder == SellingOrder.Ascending
            ? Math.Max(0, max - closing)
            : Math.Max(0, closing - min);

        return new ShiftSaleCalculationResult
        {
            OpeningSerial = openingSerial,
            ClosingSerial = closingSerial,
            SellingOrder = normalizedSellingOrder,
            SoldQuantity = sold,
            SalesAmount = sold * ticketPrice,
            RemainingTickets = remaining
        };
    }
}
