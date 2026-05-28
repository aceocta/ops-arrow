using System.Globalization;
using System.Text;

namespace ScratchCard.Application.Services.Reporting;

/// <summary>
/// Minimal dependency-free PDF generator for the close-report attachments. Produces a single
/// landscape document containing a title, a key/value meta block, and one data table. Each
/// report section (Scratch Card, Temperature, Safe Drop, Compliance) is rendered as its own
/// standalone PDF so they can be attached to the close emails as separate files.
/// </summary>
public static class ReportPdfBuilder
{
    public sealed record Column(string Header, float Width, bool AlignRight = false);

    private const float PageWidth = 842f;
    private const float PageHeight = 595f;
    private const float Margin = 36f;
    private const float ContentWidth = PageWidth - (Margin * 2f);

    private static readonly PdfColor HeaderFill = new(0.80f, 0.84f, 0.90f);
    private static readonly PdfColor TotalFill = new(0.80f, 0.84f, 0.90f);
    private static readonly PdfColor CellFill = new(1f, 1f, 1f);
    private static readonly PdfColor StripeFill = new(0.96f, 0.97f, 0.99f);
    private static readonly PdfColor BorderColor = new(0.77f, 0.81f, 0.87f);
    private static readonly PdfColor TextColor = new(0.12f, 0.20f, 0.30f);
    private static readonly PdfColor SubtleTextColor = new(0.33f, 0.44f, 0.56f);

    /// <summary>
    /// Renders a single-table report to PDF bytes. Column widths are scaled to fit the page
    /// content width, so callers can pass relative weights. <paramref name="footerNote"/> is an
    /// optional totals/summary line drawn under the table.
    /// </summary>
    public static byte[] BuildTableReport(
        string title,
        IReadOnlyList<KeyValuePair<string, string>> metaRows,
        IReadOnlyList<Column> columns,
        IReadOnlyList<IReadOnlyList<string>> rows,
        string? footerNote = null,
        string? emptyMessage = null)
    {
        var scaledColumns = ScaleColumns(columns);
        var columnOffsets = new float[scaledColumns.Count];
        var runningX = Margin;
        for (var i = 0; i < scaledColumns.Count; i++)
        {
            columnOffsets[i] = runningX;
            runningX += scaledColumns[i].Width;
        }

        var pages = new List<StringBuilder>();
        StringBuilder currentPage = NewPage(pages);
        var cursorY = Margin;

        void EnsureSpace(float requiredHeight)
        {
            if (cursorY + requiredHeight <= PageHeight - Margin) return;
            currentPage = NewPage(pages);
            cursorY = Margin;
        }

        // Title.
        EnsureSpace(40f);
        DrawText(currentPage, PageHeight, "F2", 26f, TextColor, Margin, cursorY + 26f, title);
        cursorY += 40f;

        // Meta rows (label | value).
        const float metaLabelWidth = 220f;
        var metaValueWidth = ContentWidth - metaLabelWidth;
        foreach (var meta in metaRows)
        {
            const float rowHeight = 34f;
            EnsureSpace(rowHeight);
            DrawRect(currentPage, PageHeight, Margin, cursorY, metaLabelWidth, rowHeight, CellFill, BorderColor);
            DrawRect(currentPage, PageHeight, Margin + metaLabelWidth, cursorY, metaValueWidth, rowHeight, CellFill, BorderColor);
            DrawText(currentPage, PageHeight, "F1", 14f, SubtleTextColor, Margin + 12f, cursorY + 22f, meta.Key);
            DrawText(currentPage, PageHeight, "F1", 14f, TextColor, Margin + metaLabelWidth + 12f, cursorY + 22f, meta.Value);
            cursorY += rowHeight;
        }
        cursorY += 18f;

        // Table header.
        const float headerHeight = 36f;
        EnsureSpace(headerHeight + 30f);
        DrawRect(currentPage, PageHeight, Margin, cursorY, ContentWidth, headerHeight, HeaderFill, BorderColor);
        for (var i = 0; i < scaledColumns.Count; i++)
        {
            var col = scaledColumns[i];
            var textX = col.AlignRight
                ? columnOffsets[i] + col.Width - 8f - EstimatePdfTextWidth(col.Header, 14f)
                : columnOffsets[i] + 8f;
            DrawText(currentPage, PageHeight, "F2", 14f, TextColor, textX, cursorY + 23f, col.Header);
        }
        DrawColumnBorders(currentPage, columnOffsets, scaledColumns, cursorY, headerHeight);
        cursorY += headerHeight;

        if (rows.Count == 0)
        {
            const float rowHeight = 32f;
            EnsureSpace(rowHeight);
            DrawRect(currentPage, PageHeight, Margin, cursorY, ContentWidth, rowHeight, CellFill, BorderColor);
            DrawText(currentPage, PageHeight, "F1", 13f, TextColor, Margin + 8f, cursorY + 20f, emptyMessage ?? "No records.");
            cursorY += rowHeight;
        }
        else
        {
            var rowIndex = 0;
            foreach (var row in rows)
            {
                // Wrap each cell, row height is the tallest wrapped cell.
                var wrapped = new string[scaledColumns.Count][];
                var maxLines = 1;
                for (var i = 0; i < scaledColumns.Count; i++)
                {
                    var value = i < row.Count ? row[i] : string.Empty;
                    wrapped[i] = WrapTextForPdf(value, scaledColumns[i].Width - 16f, 13f);
                    maxLines = Math.Max(maxLines, wrapped[i].Length);
                }

                var rowHeight = Math.Max(30f, 12f + (maxLines * 16f));
                EnsureSpace(rowHeight);
                DrawRect(currentPage, PageHeight, Margin, cursorY, ContentWidth, rowHeight, rowIndex % 2 == 0 ? CellFill : StripeFill, BorderColor);

                for (var i = 0; i < scaledColumns.Count; i++)
                {
                    var col = scaledColumns[i];
                    for (var line = 0; line < wrapped[i].Length; line++)
                    {
                        var lineText = wrapped[i][line];
                        var textX = col.AlignRight
                            ? columnOffsets[i] + col.Width - 8f - EstimatePdfTextWidth(lineText, 13f)
                            : columnOffsets[i] + 8f;
                        DrawText(currentPage, PageHeight, "F1", 13f, TextColor, textX, cursorY + 20f + (line * 16f), lineText);
                    }
                }
                DrawColumnBorders(currentPage, columnOffsets, scaledColumns, cursorY, rowHeight);
                cursorY += rowHeight;
                rowIndex++;
            }
        }

        if (!string.IsNullOrWhiteSpace(footerNote))
        {
            const float footerHeight = 34f;
            EnsureSpace(footerHeight);
            DrawRect(currentPage, PageHeight, Margin, cursorY, ContentWidth, footerHeight, TotalFill, BorderColor);
            DrawText(currentPage, PageHeight, "F2", 14f, TextColor, Margin + 8f, cursorY + 22f, footerNote);
            cursorY += footerHeight;
        }

        return BuildPdfFromPageContents(pages.Select(p => p.ToString()), includeBoldFont: true);
    }

    private static IReadOnlyList<Column> ScaleColumns(IReadOnlyList<Column> columns)
    {
        var total = columns.Sum(c => c.Width);
        if (total <= 0f) return columns;
        var factor = ContentWidth / total;
        return columns.Select(c => c with { Width = c.Width * factor }).ToArray();
    }

    private static void DrawColumnBorders(
        StringBuilder page,
        float[] columnOffsets,
        IReadOnlyList<Column> columns,
        float rowY,
        float rowHeight)
    {
        // Internal vertical separators (skip the first, which is the outer-left border already
        // drawn by DrawRect).
        for (var i = 1; i < columns.Count; i++)
        {
            var x = columnOffsets[i];
            var y1 = PageHeight - rowY;
            var y2 = PageHeight - rowY - rowHeight;
            page.AppendFormat(CultureInfo.InvariantCulture, "1 w\n{0:0.###} {1:0.###} {2:0.###} RG\n", BorderColor.R, BorderColor.G, BorderColor.B);
            page.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} m {0:0.###} {2:0.###} l S\n", x, y1, y2);
        }
    }

    private static StringBuilder NewPage(List<StringBuilder> pages)
    {
        var page = new StringBuilder();
        pages.Add(page);
        return page;
    }

    private static byte[] BuildPdfFromPageContents(IEnumerable<string> pageContents, bool includeBoldFont)
    {
        var pages = pageContents.ToArray();
        if (pages.Length == 0)
        {
            pages = [string.Empty];
        }

        var objectBodies = new Dictionary<int, string>
        {
            [1] = "<< /Type /Catalog /Pages 2 0 R >>",
            [3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };

        if (includeBoldFont)
        {
            objectBodies[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
        }

        var pageObjectNumbers = new List<int>();
        var nextObjectNumber = includeBoldFont ? 5 : 4;
        foreach (var content in pages)
        {
            var pageObjectNumber = nextObjectNumber++;
            var contentObjectNumber = nextObjectNumber++;
            pageObjectNumbers.Add(pageObjectNumber);

            var contentLength = Encoding.ASCII.GetByteCount(content);
            objectBodies[contentObjectNumber] = $"<< /Length {contentLength} >>\nstream\n{content}\nendstream";

            var fontResources = includeBoldFont
                ? "/Font << /F1 3 0 R /F2 4 0 R >>"
                : "/Font << /F1 3 0 R >>";

            objectBodies[pageObjectNumber] =
                $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PageWidth.ToString("0.###", CultureInfo.InvariantCulture)} {PageHeight.ToString("0.###", CultureInfo.InvariantCulture)}] " +
                $"/Resources << {fontResources} >> /Contents {contentObjectNumber} 0 R >>";
        }

        var kids = string.Join(" ", pageObjectNumbers.Select(number => $"{number} 0 R"));
        objectBodies[2] = $"<< /Type /Pages /Count {pageObjectNumbers.Count} /Kids [ {kids} ] >>";

        var maxObjectNumber = objectBodies.Keys.Max();
        var offsets = new long[maxObjectNumber + 1];

        using var stream = new MemoryStream();
        WriteAscii(stream, "%PDF-1.4\n");

        for (var objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber++)
        {
            offsets[objectNumber] = stream.Position;
            WriteAscii(stream, $"{objectNumber} 0 obj\n{objectBodies[objectNumber]}\nendobj\n");
        }

        var xrefOffset = stream.Position;
        WriteAscii(stream, $"xref\n0 {maxObjectNumber + 1}\n");
        WriteAscii(stream, "0000000000 65535 f \n");

        for (var objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber++)
        {
            WriteAscii(stream, $"{offsets[objectNumber]:0000000000} 00000 n \n");
        }

        WriteAscii(stream, $"trailer\n<< /Size {maxObjectNumber + 1} /Root 1 0 R >>\n");
        WriteAscii(stream, $"startxref\n{xrefOffset}\n%%EOF");
        return stream.ToArray();
    }

    private static string[] WrapTextForPdf(string value, float maxWidth, float fontSize)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "-" : value.Trim();
        var maxChars = Math.Max(6, (int)Math.Floor(maxWidth / (fontSize * 0.53f)));
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        var current = new StringBuilder();

        foreach (var word in words)
        {
            if (word.Length > maxChars)
            {
                if (current.Length > 0)
                {
                    lines.Add(current.ToString());
                    current.Clear();
                }

                var start = 0;
                while (start < word.Length)
                {
                    var take = Math.Min(maxChars, word.Length - start);
                    lines.Add(word.Substring(start, take));
                    start += take;
                }

                continue;
            }

            if (current.Length == 0)
            {
                current.Append(word);
                continue;
            }

            if (current.Length + 1 + word.Length <= maxChars)
            {
                current.Append(' ').Append(word);
            }
            else
            {
                lines.Add(current.ToString());
                current.Clear();
                current.Append(word);
            }
        }

        if (current.Length > 0)
        {
            lines.Add(current.ToString());
        }

        return lines.Count == 0 ? ["-"] : lines.ToArray();
    }

    private static void DrawRect(
        StringBuilder sb,
        float pageHeight,
        float x,
        float yTop,
        float width,
        float height,
        PdfColor fill,
        PdfColor stroke)
    {
        var yBottom = pageHeight - yTop - height;
        sb.AppendFormat(CultureInfo.InvariantCulture, "1 w\n{0:0.###} {1:0.###} {2:0.###} RG\n", stroke.R, stroke.G, stroke.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} rg\n", fill.R, fill.G, fill.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} {3:0.###} re B\n", x, yBottom, width, height);
    }

    private static void DrawText(
        StringBuilder sb,
        float pageHeight,
        string fontName,
        float fontSize,
        PdfColor color,
        float x,
        float yBaselineFromTop,
        string text)
    {
        var y = pageHeight - yBaselineFromTop;
        sb.Append("BT\n");
        sb.AppendFormat(CultureInfo.InvariantCulture, "/{0} {1:0.###} Tf\n", fontName, fontSize);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} rg\n", color.R, color.G, color.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "1 0 0 1 {0:0.###} {1:0.###} Tm\n", x, y);
        sb.Append('(');
        sb.Append(EscapePdfLiteralText(text));
        sb.Append(") Tj\nET\n");
    }

    private static float EstimatePdfTextWidth(string text, float fontSize)
        => (text?.Length ?? 0) * fontSize * 0.53f;

    private static string EscapePdfLiteralText(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            switch (character)
            {
                case '\\':
                    sb.Append("\\\\");
                    break;
                case '(':
                    sb.Append("\\(");
                    break;
                case ')':
                    sb.Append("\\)");
                    break;
                case '£':
                    sb.Append("\\243");
                    break;
                default:
                    if (character >= 32 && character <= 126)
                    {
                        sb.Append(character);
                    }
                    else
                    {
                        sb.Append('?');
                    }

                    break;
            }
        }

        return sb.ToString();
    }

    private static void WriteAscii(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value);
        stream.Write(bytes, 0, bytes.Length);
    }

    public static string SanitizeFileNameSegment(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var invalidCharacters = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder(value.Length);
        var lastWasSeparator = false;

        foreach (var character in value.Trim())
        {
            if (invalidCharacters.Contains(character) || char.IsControl(character))
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                sb.Append(character);
                lastWasSeparator = false;
                continue;
            }

            if (!lastWasSeparator)
            {
                sb.Append('-');
                lastWasSeparator = true;
            }
        }

        return sb.ToString().Trim('-');
    }

    private readonly record struct PdfColor(float R, float G, float B);
}
