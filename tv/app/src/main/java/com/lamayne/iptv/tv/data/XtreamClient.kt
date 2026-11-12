package com.lamayne.iptv.tv.data

import android.net.Uri
import android.util.Base64
import android.util.JsonReader
import android.util.JsonToken
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

// Xtream Codes API: authentication, live categories and live channels.
// The answers are read as a stream (JsonReader) so that a big list never sits
// in memory as one huge text: this matters on small TV boxes.
object XtreamClient {
    private const val USER_AGENT = "LAMAYNE-TV/0.1"

    class AuthException : IOException("The server refused the credentials")

    class HttpException(val code: Int) : IOException("HTTP $code")

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .build()

    fun normalizeServer(raw: String): String {
        var server = raw.trim()

        if (server.isEmpty()) return server

        if (!server.startsWith("http://", ignoreCase = true) &&
            !server.startsWith("https://", ignoreCase = true)
        ) {
            server = "http://$server"
        }

        return server.substringBefore("/player_api.php").trimEnd('/')
    }

    private fun apiUrl(
        credentials: Credentials,
        action: String? = null,
        extra: Map<String, String> = emptyMap(),
    ): HttpUrl {
        val builder = "${credentials.server}/player_api.php".toHttpUrl().newBuilder()
            .addQueryParameter("username", credentials.user)
            .addQueryParameter("password", credentials.pass)

        if (action != null) builder.addQueryParameter("action", action)

        for ((key, value) in extra) builder.addQueryParameter(key, value)

        return builder.build()
    }

    // The same request is retried (2 more times) when the server answers badly:
    // IPTV panels often fail once, then work.
    private suspend fun <T> withRetry(block: suspend () -> T): T {
        val pauses = longArrayOf(1500, 4000)
        var attempt = 0

        while (true) {
            try {
                return block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: AuthException) {
                throw e
            } catch (e: HttpException) {
                if ((e.code < 500 && e.code != 429) || attempt >= pauses.size) throw e
            } catch (e: IOException) {
                if (attempt >= pauses.size) throw e
            }

            delay(pauses[attempt])
            attempt += 1
        }
    }

    private suspend fun <T> fetch(url: HttpUrl, parse: (JsonReader) -> T): T =
        withRetry {
            withContext(Dispatchers.IO) {
                val request = Request.Builder()
                    .url(url)
                    .header("User-Agent", USER_AGENT)
                    .build()

                http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw HttpException(response.code)

                    val body = response.body ?: throw IOException("Empty response")

                    try {
                        JsonReader(InputStreamReader(body.byteStream(), Charsets.UTF_8)).use { reader ->
                            parse(reader)
                        }
                    } catch (e: IllegalStateException) {
                        throw IOException("Unexpected answer from the server")
                    }
                }
            }
        }

    suspend fun authenticate(credentials: Credentials) {
        val accepted = fetch(apiUrl(credentials)) { reader -> readAuth(reader) }

        if (!accepted) throw AuthException()
    }

    suspend fun liveCategories(credentials: Credentials): List<Category> =
        fetch(apiUrl(credentials, "get_live_categories")) { reader ->
            readArray(reader) { item -> readCategory(item) }
        }

    suspend fun liveChannels(credentials: Credentials, categoryId: String): List<Channel> =
        fetch(apiUrl(credentials, "get_live_streams", mapOf("category_id" to categoryId))) { reader ->
            readArray(reader) { item -> readChannel(item) }
        }.filter { it.categoryId == null || it.categoryId == categoryId }

    // Every live channel of the account (used by the search; about 10 MB of JSON
    // for a big provider, read as a stream).
    suspend fun allLiveChannels(credentials: Credentials): List<Channel> =
        fetch(apiUrl(credentials, "get_live_streams")) { reader ->
            readArray(reader) { item -> readChannel(item) }
        }

    // What is on now and next for one channel.
    suspend fun shortEpg(credentials: Credentials, streamId: String): List<EpgEntry> =
        fetch(
            apiUrl(
                credentials,
                "get_short_epg",
                mapOf("stream_id" to streamId, "limit" to "4"),
            )
        ) { reader -> readEpg(reader) }

    // Two ways to ask for the same live stream: MPEG-TS first (works almost
    // everywhere), then HLS.
    fun streamUrls(credentials: Credentials, channel: Channel): List<String> {
        val base = "${credentials.server}/live/${Uri.encode(credentials.user)}/" +
            "${Uri.encode(credentials.pass)}/${channel.id}"

        return listOf("$base.ts", "$base.m3u8")
    }

    // ------------------------------------------------------------ JSON reading

    private fun JsonReader.textOrNull(): String? =
        when (peek()) {
            JsonToken.STRING, JsonToken.NUMBER -> nextString()
            JsonToken.BOOLEAN -> nextBoolean().toString()
            JsonToken.NULL -> {
                nextNull()
                null
            }
            else -> {
                skipValue()
                null
            }
        }

    private fun readAuth(reader: JsonReader): Boolean {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return false
        }

        var auth = false

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "user_info" && reader.peek() == JsonToken.BEGIN_OBJECT) {
                reader.beginObject()

                while (reader.hasNext()) {
                    if (reader.nextName() == "auth") {
                        auth = reader.textOrNull() == "1"
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

        return auth
    }

    private fun <T : Any> readArray(reader: JsonReader, readItem: (JsonReader) -> T?): List<T> {
        if (reader.peek() != JsonToken.BEGIN_ARRAY) {
            reader.skipValue()
            return emptyList()
        }

        val items = ArrayList<T>()

        reader.beginArray()

        while (reader.hasNext()) {
            val item = readItem(reader)

            if (item != null) items.add(item)
        }

        reader.endArray()

        return items
    }

    private fun readCategory(reader: JsonReader): Category? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var name: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "category_id" -> id = reader.textOrNull()
                "category_name" -> name = reader.textOrNull()
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val safeId = id ?: return null
        val label = name?.trim()

        return Category(safeId, if (label.isNullOrEmpty()) safeId else label)
    }

    private fun readChannel(reader: JsonReader): Channel? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var name: String? = null
        var icon: String? = null
        var categoryId: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "stream_id" -> id = reader.textOrNull()
                "name" -> name = reader.textOrNull()
                "stream_icon" -> icon = reader.textOrNull()
                "category_id" -> categoryId = reader.textOrNull()
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val safeId = id ?: return null
        val label = name?.trim()

        return Channel(
            id = safeId,
            name = if (label.isNullOrEmpty()) safeId else label,
            icon = icon?.takeIf { it.isNotBlank() },
            categoryId = categoryId,
        )
    }

    private fun readEpg(reader: JsonReader): List<EpgEntry> {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return emptyList()
        }

        var entries: List<EpgEntry> = emptyList()

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "epg_listings") {
                entries = readArray(reader) { item -> readEpgEntry(item) }
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return entries
    }

    private fun readEpgEntry(reader: JsonReader): EpgEntry? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var title: String? = null
        var start = 0L
        var stop = 0L

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "title" -> title = reader.textOrNull()
                "start_timestamp" -> start = reader.textOrNull()?.toLongOrNull() ?: 0L
                "stop_timestamp" -> stop = reader.textOrNull()?.toLongOrNull() ?: 0L
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        if (start == 0L || stop == 0L) return null

        return EpgEntry(decodeTitle(title.orEmpty()), start, stop)
    }

    // Xtream sends programme titles in Base64; a few panels send plain text.
    private fun decodeTitle(raw: String): String {
        if (raw.isBlank()) return ""

        return try {
            val decoded = String(Base64.decode(raw, Base64.DEFAULT), Charsets.UTF_8).trim()
            val garbled = decoded.isEmpty() ||
                decoded.any { it == '\uFFFD' || (it < ' ' && it != '\n') }

            if (garbled) raw.trim() else decoded
        } catch (e: IllegalArgumentException) {
            raw.trim()
        }
    }
}
