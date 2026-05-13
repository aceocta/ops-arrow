namespace ScratchCard.Domain.Entities;

public class CfgBarcodeSettings : CfgSettingsBase
{
    public bool? EnableMobileCameraBarcodeScanning { get; set; }
    public bool? AllowManualEntryIfScanFails { get; set; }
    public string? BarcodeContains { get; set; }
    public int? PackNumberStartPosition { get; set; }
    public int? PackNumberLength { get; set; }
    public int? SerialNumberStartPosition { get; set; }
    public int? BarcodeSerialNumberLength { get; set; }
    public string? RemovePrefix { get; set; }
    public string? RemoveSuffix { get; set; }
}
