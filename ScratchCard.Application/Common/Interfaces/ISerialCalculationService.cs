using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

public interface ISerialCalculationService
{
    Common.Models.ShiftSaleCalculationResult Calculate(
        string openingSerial,
        string closingSerial,
        string startSerial,
        string endSerial,
        SellingOrder sellingOrder,
        decimal ticketPrice,
        int totalTickets);
}
