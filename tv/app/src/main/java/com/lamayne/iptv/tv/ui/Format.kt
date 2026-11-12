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
