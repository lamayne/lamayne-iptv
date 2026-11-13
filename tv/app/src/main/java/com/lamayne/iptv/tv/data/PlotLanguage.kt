package com.lamayne.iptv.tv.data

import java.util.Locale

// Tells the language of a synopsis from its most common words. The categories of a provider
// are often not tagged with a language, and the synopsis is what the viewer actually reads.
object PlotLanguage {
    private val WORDS: Map<String, Set<String>> = mapOf(
        "fr" to setOf(
            "les", "des", "une", "est", "dans", "pour", "qui", "que", "avec", "sont", "cette",
            "ses", "aux", "mais", "sur", "par", "pas", "elle", "ils", "leur", "doit", "va",
        ),
        "en" to setOf(
            "the", "and", "with", "his", "her", "that", "from", "they", "their", "was", "who",
            "when", "after", "into", "are", "for", "has", "but", "must", "will", "have",
        ),
        "es" to setOf(
            "los", "las", "una", "con", "por", "del", "para", "como", "pero", "más", "sus",
            "está", "son", "que", "cuando", "tras", "debe",
        ),
        "de" to setOf(
            "der", "die", "das", "und", "ist", "mit", "nicht", "ein", "eine", "den", "dem",
            "sich", "auf", "für", "von", "wird", "muss",
        ),
        "it" to setOf(
            "gli", "che", "della", "delle", "nel", "sono", "per", "con", "dei", "una", "alla",
            "suo", "sua", "deve",
        ),
        "pt" to setOf(
            "uma", "não", "com", "por", "dos", "das", "mais", "são", "seu", "sua", "quando",
            "deve", "para",
        ),
        "nl" to setOf("het", "een", "van", "met", "voor", "zijn", "dat", "ook", "wordt", "moet"),
    )

    private val LETTERS = Regex("[\\p{L}]+")

    // The language code ("fr", "en"...), or null when the text is too short or not clear.
    fun detect(text: String?): String? {
        val plot = text?.lowercase(Locale.ROOT)?.trim().orEmpty()

        if (plot.length < 30) return null

        // other alphabets
        val letters = plot.count { it.isLetter() }

        if (letters > 0) {
            val cyrillic = plot.count { it in '\u0400'..'\u04FF' }
            val arabic = plot.count { it in '\u0600'..'\u06FF' }

            if (cyrillic * 3 > letters) return "ru"
            if (arabic * 3 > letters) return "ar"
        }

        val words = LETTERS.findAll(plot).map { it.value }.toList()
        val scores = WORDS.mapValues { entry -> words.count { it in entry.value } }
        val ranked = scores.entries.sortedByDescending { it.value }
        val best = ranked.firstOrNull() ?: return null
        val second = ranked.getOrNull(1)?.value ?: 0

        // at least a few clear words, and clearly ahead of the next language
        return if (best.value >= 3 && best.value >= second * 1.5) best.key else null
    }

    // The language most of several synopses agree on (at least two of them).
    fun majority(plots: List<String?>): String? {
        val votes = plots.mapNotNull { detect(it) }.groupingBy { it }.eachCount()
        val top = votes.entries.maxByOrNull { it.value } ?: return null

        return if (top.value >= 2) top.key else null
    }
}
