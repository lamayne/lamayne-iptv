package com.lamayne.iptv.tv.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Providers prefix names with a country tag: "|FR| TF1" is shown as "TF1".
private val COUNTRY_PREFIX = Regex("^\\s*[|\\[(]?[A-Za-z]{2,3}[|\\])]\\s*[:\\-]?\\s*")

fun displayName(raw: String): String {
    val cleaned = raw.replace(COUNTRY_PREFIX, "").trim()

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
