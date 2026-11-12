package com.lamayne.iptv.tv.data

import android.util.JsonReader
import android.util.JsonToken
import com.lamayne.iptv.tv.normalizeText
import com.lamayne.iptv.tv.ui.displayName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

// The films of an actor, from Wikidata (free, no key). Only the name of the actor
// is sent, and only when the user selects it on a movie page.
object Filmography {
    private const val USER_AGENT = "LAMAYNE-IPTV/0.3 (https://github.com/lamayne/lamayne-iptv)"

    data class Film(val titles: List<String>, val year: Int?)

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(40, TimeUnit.SECONDS)
        .build()

    suspend fun fetch(name: String): List<Film> =
        withContext(Dispatchers.IO) {
            val clean = name.trim().replace('"', ' ')

            if (clean.length !in 2..80) return@withContext emptyList()

            val id = findActorId(clean) ?: return@withContext emptyList()

            queryFilms(id)
        }

    private fun <T> get(url: okhttp3.HttpUrl, parse: (JsonReader) -> T): T {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/json")
            .build()

        return http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")

            val body = response.body ?: throw IOException("Empty response")

            try {
                JsonReader(InputStreamReader(body.byteStream(), Charsets.UTF_8)).use { reader -> parse(reader) }
            } catch (e: IllegalStateException) {
                throw IOException("Unexpected answer")
            }
        }
    }

    // Q33999 = "actor": only people with that occupation are considered.
    private fun findActorId(name: String): String? {
        val url = "https://www.wikidata.org/w/api.php".toHttpUrl().newBuilder()
            .addQueryParameter("action", "query")
            .addQueryParameter("list", "search")
            .addQueryParameter("srsearch", "$name haswbstatement:P106=Q33999")
            .addQueryParameter("srnamespace", "0")
            .addQueryParameter("srlimit", "3")
            .addQueryParameter("format", "json")
            .build()

        return get(url) { reader -> readFirstId(reader) }
    }

    private fun readFirstId(reader: JsonReader): String? {
        var found: String? = null

        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "query" && reader.peek() == JsonToken.BEGIN_OBJECT) {
                reader.beginObject()

                while (reader.hasNext()) {
                    if (reader.nextName() == "search" && reader.peek() == JsonToken.BEGIN_ARRAY) {
                        reader.beginArray()

                        while (reader.hasNext()) {
                            if (reader.peek() != JsonToken.BEGIN_OBJECT) {
                                reader.skipValue()
                                continue
                            }

                            reader.beginObject()

                            while (reader.hasNext()) {
                                if (reader.nextName() == "title" && reader.peek() == JsonToken.STRING) {
                                    val title = reader.nextString()

                                    if (found == null && title.length >= 2 && title[0] == 'Q' &&
                                        title.substring(1).all { it.isDigit() }
                                    ) {
                                        found = title
                                    }
                                } else {
                                    reader.skipValue()
                                }
                            }

                            reader.endObject()
                        }

                        reader.endArray()
                    } else {
                        reader.skipValue()
                    }
                }

                reader.endObject()
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return found
    }

    // The films (and their sub-types) where the actor is in the cast, with their
    // titles in French, English and original version, and the year.
    private fun queryFilms(id: String): List<Film> {
        val query = """SELECT ?film (MIN(?year) AS ?y) (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) WHERE {
  ?film wdt:P161 wd:$id .
  ?film wdt:P31/wdt:P279* wd:Q11424 .
  OPTIONAL { ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  { ?film rdfs:label ?label . FILTER(LANG(?label) IN ("fr", "en")) }
  UNION { ?film skos:altLabel ?label . FILTER(LANG(?label) IN ("fr", "en")) }
  UNION { ?film wdt:P1476 ?label . }
}
GROUP BY ?film
LIMIT 400"""
        val url = "https://query.wikidata.org/sparql".toHttpUrl().newBuilder()
            .addQueryParameter("format", "json")
            .addQueryParameter("query", query)
            .build()

        return get(url) { reader -> readFilms(reader) }
    }

    private fun readFilms(reader: JsonReader): List<Film> {
        val films = ArrayList<Film>()

        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return films
        }

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "results" && reader.peek() == JsonToken.BEGIN_OBJECT) {
                reader.beginObject()

                while (reader.hasNext()) {
                    if (reader.nextName() == "bindings" && reader.peek() == JsonToken.BEGIN_ARRAY) {
                        reader.beginArray()

                        while (reader.hasNext()) {
                            readBinding(reader)?.let { films.add(it) }
                        }

                        reader.endArray()
                    } else {
                        reader.skipValue()
                    }
                }

                reader.endObject()
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return films
    }

    // One row: {"y": {"value": "1999"}, "labels": {"value": "Fight Club|Fight Club (film)"}}
    private fun readBinding(reader: JsonReader): Film? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var labels: String? = null
        var year: Int? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "labels" -> labels = readValue(reader)
                "y" -> year = readValue(reader)?.toIntOrNull()
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val titles = labels.orEmpty()
            .split('|')
            .map { it.trim() }
            .filter { it.isNotEmpty() && it.length <= 200 }
            .distinct()
            .take(8)

        return if (titles.isEmpty()) null else Film(titles, year)
    }

    private fun readValue(reader: JsonReader): String? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var value: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "value" && reader.peek() == JsonToken.STRING) {
                value = reader.nextString()
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return value
    }

    // ---------------------------------------------------------------- matching

    private val YEAR_SUFFIX = Regex("""[(\[]\s*((?:19|20)\d{2})\s*[)\]]\s*$""")
    private val NOT_ALNUM = Regex("""[^a-z0-9 ]""")
    private val QUALITY = setOf("4k", "uhd", "fhd", "hd", "sd", "hdr", "multi", "vostfr", "vf", "vo", "remux")

    // A title without the provider's tags, the year, accents and punctuation:
    // "|FR| 4K Mr. & Mrs. Smith (2005)" -> ("mr mrs smith", 2005)
    fun titleKey(raw: String): Pair<String, Int?> {
        var text = displayName(raw)
        var year: Int? = null
        val match = YEAR_SUFFIX.find(text)

        if (match != null) {
            year = match.groupValues[1].toIntOrNull()
            text = text.substring(0, match.range.first).trim()
        }

        val words = normalizeText(text)
            .replace(NOT_ALNUM, " ")
            .split(' ')
            .filter { it.isNotBlank() }
            .toMutableList()

        while (words.size > 1 && words.first() in QUALITY) words.removeAt(0)
        while (words.size > 1 && words.last() in QUALITY) words.removeAt(words.size - 1)

        return words.joinToString(" ") to year
    }
}
