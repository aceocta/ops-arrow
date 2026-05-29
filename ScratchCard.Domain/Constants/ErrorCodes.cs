namespace ScratchCard.Domain.Constants;

public static class ErrorCodes
{
    public const string InvitationExpired = "invitation_expired";
    public const string InvitationEmailMismatch = "invitation_email_mismatch";
    public const string InvitationAlreadyUsed = "invitation_already_used";
    public const string PackNotFound = "pack_not_found";
    public const string PackNotActive = "pack_not_active";
    public const string DuplicatePackNumber = "duplicate_pack_number";
    public const string InvalidSerialRange = "invalid_serial_range";
    public const string ClosingSerialOutOfRange = "closing_serial_out_of_range";
    public const string InvalidSellingOrderSequence = "invalid_selling_order_sequence";
    public const string ShiftAlreadyClosed = "shift_already_closed";
    public const string ShiftNotOpen = "shift_not_open";
    public const string ShiftReopenNotLatest = "shift_reopen_not_latest";
    public const string BusinessDayHasOpenShifts = "business_day_has_open_shifts";
    public const string BusinessDayHasPendingSyncShifts = "business_day_has_pending_sync_shifts";
    public const string DuplicatePrizePayout = "duplicate_prize_payout";
    public const string OfflineSyncConflict = "offline_sync_conflict";
    public const string UnauthorizedRole = "unauthorized_role";
    public const string InvalidFileType = "invalid_file_type";
    public const string DeliveryNoteImageRequired = "delivery_note_image_required";
    public const string DeliveryNoteAiNotConfigured = "delivery_note_ai_not_configured";
    public const string DeliveryNoteParseFailed = "delivery_note_parse_failed";
    public const string GameNotInCatalog = "game_not_in_catalog";
    public const string TemperatureActionRequired = "temperature_action_required";
    public const string ChecklistRequiredTasksPending = "checklist_required_tasks_pending";
    public const string TillReportImageRequired = "till_report_image_required";
    public const string TillReportOcrNotConfigured = "till_report_ocr_not_configured";
    public const string TillReportOcrFailed = "till_report_ocr_failed";
    public const string TillReportNotFound = "till_report_not_found";
    public const string TillReportAlreadyConfirmed = "till_report_already_confirmed";
    public const string TillReportLineNotFound = "till_report_line_not_found";
    public const string TillCategoryRuleNotFound = "till_category_rule_not_found";
}
