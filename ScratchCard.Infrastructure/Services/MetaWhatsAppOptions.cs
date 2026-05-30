namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Configuration for sending WhatsApp messages via Meta's WhatsApp Business Cloud API.
/// Obtain these from Meta Business Suite -> WhatsApp -> API Setup.
///
/// Setup steps (one-time):
///   1. Create a Meta Business Account (https://business.facebook.com).
///   2. Create a Meta App, add "WhatsApp" product.
///   3. Add a verified phone number to the app -> grab the PhoneNumberId.
///   4. Generate a permanent access token via a System User (do NOT use the short-lived dev token).
///   5. Create + submit at least one message template in Meta Business Manager. The simplest
///      is a body-only template with one {{1}} parameter. Note its Name and Language.
///
/// While templates are pending approval, you can test against Meta's WhatsApp test number with
/// up to 5 verified recipient numbers using the auto-provisioned "hello_world" template.
/// </summary>
public sealed class MetaWhatsAppOptions
{
    /// <summary>
    /// System User access token (recommended) or temporary dev token. Required.
    /// </summary>
    public string? AccessToken { get; set; }

    /// <summary>
    /// The phone number ID (NOT the phone number itself) of the WABA-attached sending number,
    /// as shown in Meta's API setup screen. Required.
    /// </summary>
    public string? PhoneNumberId { get; set; }

    /// <summary>
    /// Graph API version to target. Defaults to a known-stable major version. Update annually
    /// per Meta's deprecation schedule.
    /// </summary>
    public string ApiVersion { get; set; } = "v21.0";

    /// <summary>
    /// Pre-approved template name to use for outbound transactional messages. Templates are
    /// required by Meta for messages outside the 24h customer-initiated window — which covers
    /// virtually all server-side notifications. Required for production sends.
    /// </summary>
    public string? TemplateName { get; set; }

    /// <summary>
    /// Language code matching the approved template (e.g. "en", "en_GB"). Defaults to "en".
    /// </summary>
    public string TemplateLanguage { get; set; } = "en";

    /// <summary>
    /// Dev/testing convenience: when true the sender bypasses the template path and tries to
    /// send the raw text as a "text" message body. ONLY works against a recipient who messaged
    /// your number within the last 24h (typically the test number setup). Leave false in prod.
    /// </summary>
    public bool UseTextFallback { get; set; } = false;
}
