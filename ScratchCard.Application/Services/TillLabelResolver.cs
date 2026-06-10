using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Helpers;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Tiered label → canonical-field resolver. Priority: Till learned → Shop learned → Global seed →
/// fuzzy match → Unmapped. (AI fallback is a later phase.) Learns confirmed mappings per scope.
/// </summary>
public sealed class TillLabelResolver : ITillLabelResolver
{
    // Minimum similarity (0–1) for a fuzzy match to be accepted automatically.
    private const double FuzzyThreshold = 0.88;

    private readonly IRepository<TillLabelMapping> _mappings;
    private readonly IUnitOfWork _unitOfWork;

    public TillLabelResolver(IRepository<TillLabelMapping> mappings, IUnitOfWork unitOfWork)
    {
        _mappings = mappings;
        _unitOfWork = unitOfWork;
    }

    public async Task<TillLabelResolution> ResolveAsync(
        string rawLabel, Guid? shopId, Guid? tillId, string? section = null, CancellationToken cancellationToken = default)
    {
        var normalized = TillLabelNormalizer.Normalize(rawLabel);
        var unmapped = nameof(TillCanonicalField.Unmapped);
        if (string.IsNullOrEmpty(normalized))
        {
            return new TillLabelResolution(unmapped, 0, TillMappingSource.Manual, normalized);
        }

        // Load candidate learned mappings (this normalized label across the relevant scopes).
        var learned = await _mappings.Query()
            .AsNoTracking()
            .Where(m => m.NormalizedLabel == normalized &&
                (m.Scope == TillMappingScope.Global ||
                 (m.Scope == TillMappingScope.Shop && m.ScopeId == shopId) ||
                 (m.Scope == TillMappingScope.Till && m.ScopeId == tillId)))
            .ToListAsync(cancellationToken);

        // 1–3: Till > Shop > Global, preferring a section-specific row, then any.
        foreach (var scope in new[] { TillMappingScope.Till, TillMappingScope.Shop, TillMappingScope.Global })
        {
            var inScope = learned.Where(m => m.Scope == scope).ToList();
            if (inScope.Count == 0) continue;
            var hit = inScope.FirstOrDefault(m => SectionMatches(m.Section, section)) ?? inScope[0];
            var code = string.IsNullOrWhiteSpace(hit.FieldCode) ? hit.CanonicalField.ToString() : hit.FieldCode;
            return new TillLabelResolution(code, 1.0, hit.Source, normalized);
        }

        // 3b: Global seed/alias dictionary (alias → code).
        if (TillAliasDictionary.Active.TryGetValue(normalized, out var seededCode))
        {
            return new TillLabelResolution(seededCode, 1.0, TillMappingSource.Seeded, normalized);
        }

        // 4: Fuzzy match against the alias dictionary (handles OCR typos).
        var best = BestFuzzy(normalized);
        if (best is { } b && b.Score >= FuzzyThreshold)
        {
            return new TillLabelResolution(b.Code, b.Score, TillMappingSource.Fuzzy, normalized);
        }

        // 5: AI fallback — later phase.
        return new TillLabelResolution(unmapped, 0, TillMappingSource.Manual, normalized);
    }

    public async Task LearnAsync(
        string rawLabel, string code, TillMappingScope scope, Guid? scopeId,
        string? section = null, CancellationToken cancellationToken = default)
    {
        var field = Enum.TryParse<TillCanonicalField>(code, out var f) ? f : TillCanonicalField.Unmapped;
        var normalized = TillLabelNormalizer.Normalize(rawLabel);
        if (string.IsNullOrEmpty(normalized)) return;

        var existing = await _mappings.Query()
            .FirstOrDefaultAsync(m =>
                m.Scope == scope && m.ScopeId == scopeId && m.NormalizedLabel == normalized &&
                m.Section == section, cancellationToken);

        if (existing is null)
        {
            await _mappings.AddAsync(new TillLabelMapping
            {
                Scope = scope,
                ScopeId = scopeId,
                NormalizedLabel = normalized,
                RawSample = rawLabel.Trim(),
                Section = section,
                CanonicalField = field,
                FieldCode = code,
                Source = TillMappingSource.Learned,
                Confidence = 1.0,
            }, cancellationToken);
        }
        else
        {
            existing.CanonicalField = field;
            existing.FieldCode = code;
            existing.RawSample = rawLabel.Trim();
            existing.Source = TillMappingSource.Learned;
            existing.Confidence = 1.0;
            _mappings.Update(existing);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ForgetAsync(string rawLabel, TillMappingScope scope, Guid? scopeId, CancellationToken cancellationToken = default)
    {
        var normalized = TillLabelNormalizer.Normalize(rawLabel);
        if (string.IsNullOrEmpty(normalized)) return;

        var rows = await _mappings.Query()
            .Where(m => m.Scope == scope && m.ScopeId == scopeId && m.NormalizedLabel == normalized)
            .ToListAsync(cancellationToken);
        if (rows.Count == 0) return;
        foreach (var row in rows) _mappings.Remove(row);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static bool SectionMatches(string? mappingSection, string? requested)
        => string.IsNullOrEmpty(mappingSection) || string.Equals(mappingSection, requested, StringComparison.OrdinalIgnoreCase);

    private static (string Code, double Score)? BestFuzzy(string normalized)
    {
        (string Code, double Score)? best = null;
        foreach (var (alias, code) in TillAliasDictionary.Active)
        {
            var score = Similarity(normalized, alias);
            if (best is null || score > best.Value.Score)
            {
                best = (code, score);
            }
        }
        return best;
    }

    // Normalized Levenshtein similarity in [0,1].
    private static double Similarity(string a, string b)
    {
        if (a.Length == 0 || b.Length == 0) return 0;
        var distance = Levenshtein(a, b);
        var max = Math.Max(a.Length, b.Length);
        return 1.0 - (double)distance / max;
    }

    private static int Levenshtein(string a, string b)
    {
        var prev = new int[b.Length + 1];
        var curr = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) prev[j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            curr[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            (prev, curr) = (curr, prev);
        }
        return prev[b.Length];
    }
}
