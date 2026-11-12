package com.lamayne.iptv.tv.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Providers prefix names with a country tag ("|FR| TF1") and add the quality
// ("TF1 FHD", "FHD| TF1", "4K Tetris"): none of this belongs in the title.
private val COUNTRY_PREFIX = Regex("^\\s*[|\\[(]?[A-Za-z]{2,3}[|\\])]\\s*[:\\-]?\\s*")
private const val QUALITY_WORDS = "FHD|UHD|HD|SD|4K|8K|HEVC|H265|H264|RAW|50FPS|60FPS"
private val QUALITY_START = Regex("(?i)^\\s*(?:(?:$QUALITY_WORDS)\\b\\s*[|:\\-]?\\s*)+")
private val QUALITY_END = Regex("(?i)(?:\\s*[|:\\-]?\\s*\\b(?:$QUALITY_WORDS))+\\s*$")

fun displayName(raw: String): String {
    var cleaned = raw.replace(COUNTRY_PREFIX, "")

    cleaned = cleaned.replace(QUALITY_START, "").replace(QUALITY_END, "").trim()

    return if (cleaned.isEmpty()) raw.trim() else cleaned
}

fun initials(name: String): String {
    val words = displayName(name).split(' ', '-', '_').filter { it.isNotBlank() }

    return when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(2).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}

fun formatClock(epochSeconds: Long): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(epochSeconds * 1000))

// 83 725 000 ms -> "23:15:25"; 754 000 ms -> "12:34"
fun formatDuration(milliseconds: Long): String {
    val total = (milliseconds / 1000).coerceAtLeast(0)
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60

    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.US, "%d:%02d", minutes, seconds)
    }
}

// "7.4" for a rating the provider wrote as "7.4", "7.399" or "7"; null when empty or 0.
fun ratingText(raw: String?): String? {
    val value = raw?.toDoubleOrNull() ?: return null

    return if (value > 0) String.format(Locale.US, "%.1f", value) else null
}

// ---------------------------------------------------------------- live channels (same rules as the Windows app)

data class ChannelLabel(val name: String, val quality: String)

private val PREFIX_TOKENS = setOf(
    "FR", "BE", "CH", "CA", "UK", "GB", "US", "USA", "DE", "ES", "IT", "PT", "NL", "PL", "RO", "GR",
    "TR", "BR", "MX", "AR", "MA", "DZ", "TN", "AL", "AT", "AU", "BG", "CZ", "DK", "FI", "HR", "HU",
    "IE", "IN", "JP", "KR", "NO", "NZ", "RS", "RU", "SE", "SI", "SK", "UA", "ZA",
    "SD", "HD", "FHD", "FULL HD", "UHD", "4K", "8K", "HEVC", "H264", "H265",
)
private val QUALITY_ANY = Regex("(?i)\\b(?:FULL\\s+HD|8K|4K|UHD|FHD|HD|SD|HEVC|H264|H265)\\b")
private val BRACKET_PREFIX = Regex("^(?:\\[([^\\]]+)\\]|\\(([^)]+)\\))\\s*")
private val EMPTY_BRACKETS = Regex("\\[\\s*\\]|\\(\\s*\\)")
private val EDGE_JUNK = Regex("^[\\s|=:>_-]+|[\\s|=:>_-]+$")
private val SPACES = Regex("\\s+")
private val TOKEN_SPLIT = Regex("[\\s:/_-]+")

private fun isTechnicalPrefix(value: String): Boolean {
    val normalized = value.trim().replace(SPACES, " ").uppercase()

    if (normalized in PREFIX_TOKENS) return true

    val tokens = normalized.split(TOKEN_SPLIT).filter { it.isNotEmpty() }

    return tokens.isNotEmpty() && tokens.all { it in PREFIX_TOKENS }
}

// "|FR|FHD|= TF1" -> name "TF1", quality "FHD". Only recognised parts are removed:
// an unknown prefix is kept.
fun channelLabel(original: String): ChannelLabel {
    var name = original.trim()
    val quality = when {
        Regex("(?i)\\b8K\\b").containsMatchIn(name) -> "8K"
        Regex("(?i)\\b4K\\b").containsMatchIn(name) -> "4K"
        Regex("(?i)\\bUHD\\b").containsMatchIn(name) -> "UHD"
        Regex("(?i)\\bFHD\\b|\\bFULL\\s+HD\\b").containsMatchIn(name) -> "FHD"
        Regex("(?i)\\bHD\\b").containsMatchIn(name) -> "HD"
        Regex("(?i)\\bSD\\b").containsMatchIn(name) -> "SD"
        else -> ""
    }

    if (name.startsWith("|")) {
        val segments = name.split("|")
        var position = 1
        var removed = false

        while (position < segments.size - 1 && isTechnicalPrefix(segments[position])) {
            position += 1
            removed = true
        }

        if (removed) name = segments.drop(position).joinToString("|")
    }

    var changed = true

    while (changed) {
        changed = false

        val trimmed = name.trimStart()
        val match = BRACKET_PREFIX.find(trimmed)
        val token = match?.groupValues?.get(1)?.ifEmpty { null } ?: match?.groupValues?.get(2)?.ifEmpty { null }

        if (match != null && token != null && isTechnicalPrefix(token)) {
            name = trimmed.substring(match.value.length)
            changed = true
        }
    }

    name = name
        .replace(QUALITY_ANY, " ")
        .replace(EMPTY_BRACKETS, " ")
        .replace(EDGE_JUNK, "")
        .replace(SPACES, " ")
        .trim()

    if (name.isEmpty()) name = original.trim().ifEmpty { "TV" }

    return ChannelLabel(name, quality)
}

fun channelName(raw: String): String = channelLabel(raw).name
