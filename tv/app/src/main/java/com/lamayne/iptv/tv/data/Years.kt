package com.lamayne.iptv.tv.data

// The year a movie or series came out, when the provider (or the title) says it:
// "Dune (2021)", "Dune [2021]", or a "releaseDate" field. Null when nothing says it.
object Years {
    private val IN_BRACKETS = Regex("""[(\[]\s*((?:19|20)\d{2})\s*[)\]]""")
    private val ANY_YEAR = Regex("""\b((?:19|20)\d{2})\b""")

    fun from(name: String?, field: String?): Int? {
        field?.let { value -> ANY_YEAR.find(value)?.groupValues?.get(1)?.toIntOrNull()?.let { return it } }
        name?.let { value -> IN_BRACKETS.find(value)?.groupValues?.get(1)?.toIntOrNull()?.let { return it } }

        return null
    }
}
