package com.lamayne.iptv.tv.data

// Hides what must never be shown on screen: the user and password inside an address
// (".../live/USER/PASS/123.ts", "get.php?username=...&password=...").
object Secrets {
    private val QUERY = Regex("(?i)(username|password|user|pass)=[^&\\s\"']+")
    private val PATH = Regex("(?i)/(live|movie|series)/[^/\\s]+/[^/\\s]+/")

    fun redact(text: String?): String? =
        text
            ?.replace(QUERY) { match -> match.groupValues[1] + "=***" }
            ?.replace(PATH) { match -> "/" + match.groupValues[1] + "/***/***/" }
}
