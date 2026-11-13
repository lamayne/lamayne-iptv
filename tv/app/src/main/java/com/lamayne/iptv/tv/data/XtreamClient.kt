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
import java.util.TreeMap
import java.util.concurrent.TimeUnit

// Xtream Codes API: account, live TV, movies, series and the programme guide.
// Answers are read as a stream (JsonReader) so that a big list never sits in
// memory as one huge text: this matters on small TV boxes.
object XtreamClient {
    private const val USER_AGENT = "LAMAYNE-TV/0.2"

    class AuthException : IOException("The server refused the credentials")

    class HttpException(val code: Int) : IOException("HTTP $code")

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS)
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

    // ---------------------------------------------------------------- account

    suspend fun authenticate(credentials: Credentials) {
        val accepted = fetch(apiUrl(credentials)) { reader -> readAuth(reader) }

        if (!accepted) throw AuthException()
    }

    // ---------------------------------------------------------------- live TV

    suspend fun liveCategories(credentials: Credentials): List<Category> =
        fetch(apiUrl(credentials, "get_live_categories")) { reader ->
            readArray(reader) { item -> readCategory(item) }
        }

    suspend fun liveChannels(credentials: Credentials, categoryId: String): List<Channel> =
        fetch(apiUrl(credentials, "get_live_streams", mapOf("category_id" to categoryId))) { reader ->
            readArray(reader) { item -> readChannel(item) }
        }.filter { it.categoryId == null || it.categoryId == categoryId }

    // Every live channel of the account (used by the search).
    suspend fun allLiveChannels(credentials: Credentials): List<Channel> =
        fetch(apiUrl(credentials, "get_live_streams")) { reader ->
            readArray(reader) { item -> readChannel(item) }
        }

    // Only the name and the number of every live channel: a light list (no pictures, no
    // categories), used to find the same channel in another category.
    suspend fun liveNames(credentials: Credentials): List<Pair<String, String>> =
        fetch(apiUrl(credentials, "get_live_streams")) { reader ->
            readArray(reader) { item -> readNameAndId(item) }
        }

    private fun readNameAndId(reader: JsonReader): Pair<String, String>? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var name: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "stream_id" -> id = reader.textOrNull()
                "name" -> name = reader.textOrNull()
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val streamId = id ?: return null
        val streamName = name ?: return null

        return streamName to streamId
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

    // ---------------------------------------------------------------- movies

    suspend fun movieCategories(credentials: Credentials): List<Category> =
        fetch(apiUrl(credentials, "get_vod_categories")) { reader ->
            readArray(reader) { item -> readCategory(item) }
        }

    suspend fun movies(credentials: Credentials, categoryId: String): List<Movie> =
        fetch(apiUrl(credentials, "get_vod_streams", mapOf("category_id" to categoryId))) { reader ->
            readArray(reader) { item -> readMovie(item) }
        }.filter { it.categoryId == null || it.categoryId == categoryId }

    suspend fun allMovies(credentials: Credentials): List<Movie> =
        fetch(apiUrl(credentials, "get_vod_streams")) { reader ->
            readArray(reader) { item -> readMovie(item) }
        }

    suspend fun movieInfo(credentials: Credentials, movieId: String): MediaInfo =
        fetch(apiUrl(credentials, "get_vod_info", mapOf("vod_id" to movieId))) { reader ->
            readInfoRoot(reader)
        }

    // ---------------------------------------------------------------- series

    suspend fun seriesCategories(credentials: Credentials): List<Category> =
        fetch(apiUrl(credentials, "get_series_categories")) { reader ->
            readArray(reader) { item -> readCategory(item) }
        }

    suspend fun series(credentials: Credentials, categoryId: String): List<Series> =
        fetch(apiUrl(credentials, "get_series", mapOf("category_id" to categoryId))) { reader ->
            readArray(reader) { item -> readSeries(item) }
        }.filter { it.categoryId == null || it.categoryId == categoryId }

    suspend fun allSeries(credentials: Credentials): List<Series> =
        fetch(apiUrl(credentials, "get_series")) { reader ->
            readArray(reader) { item -> readSeries(item) }
        }

    suspend fun seriesInfo(credentials: Credentials, seriesId: String): SeriesInfo =
        fetch(apiUrl(credentials, "get_series_info", mapOf("series_id" to seriesId))) { reader ->
            readSeriesRoot(reader)
        }

    // ---------------------------------------------------------------- addresses

    // Two ways to ask for the same live stream: MPEG-TS first (works almost
    // everywhere), then HLS.
    fun streamUrls(credentials: Credentials, channel: Channel): List<String> {
        channel.url?.let { return listOf(it) }

        val base = "${credentials.server}/live/${Uri.encode(credentials.user)}/" +
            "${Uri.encode(credentials.pass)}/${channel.id}"

        return listOf("$base.ts", "$base.m3u8")
    }

    fun vodUrl(credentials: Credentials, request: VodRequest): String {
        val folder = if (request.kind == MediaKind.EPISODE) "series" else "movie"

        return "${credentials.server}/$folder/${Uri.encode(credentials.user)}/" +
            "${Uri.encode(credentials.pass)}/${request.id}.${request.ext}"
    }

    // ---------------------------------------------------------------- JSON reading

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

    // A value that is a text, or a list of texts (we keep the first one).
    private fun JsonReader.firstTextOrNull(): String? {
        if (peek() != JsonToken.BEGIN_ARRAY) return textOrNull()

        var first: String? = null

        beginArray()

        while (hasNext()) {
            val value = textOrNull()

            if (first == null && !value.isNullOrBlank()) first = value
        }

        endArray()

        return first
    }

    suspend fun accountInfo(credentials: Credentials): AccountInfo? =
        fetch(apiUrl(credentials)) { reader -> readAccount(reader) }

    private fun readAccount(reader: JsonReader): AccountInfo? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var info: AccountInfo? = null

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "user_info" && reader.peek() == JsonToken.BEGIN_OBJECT) {
                var expires: Long? = null
                var status: String? = null
                var trial = false
                var max: Int? = null
                var active: Int? = null

                reader.beginObject()

                while (reader.hasNext()) {
                    when (reader.nextName()) {
                        "exp_date" -> expires = reader.textOrNull()?.toLongOrNull()
                        "status" -> status = reader.textOrNull()
                        "is_trial" -> trial = reader.textOrNull() == "1"
                        "max_connections" -> max = reader.textOrNull()?.toIntOrNull()
                        "active_cons" -> active = reader.textOrNull()?.toIntOrNull()
                        else -> reader.skipValue()
                    }
                }

                reader.endObject()

                info = AccountInfo(expires?.takeIf { it > 0 }, status, trial, max, active)
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return info
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

    private fun readMovie(reader: JsonReader): Movie? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var name: String? = null
        var poster: String? = null
        var categoryId: String? = null
        var ext: String? = null
        var rating: String? = null
        var added = 0L

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "stream_id" -> id = reader.textOrNull()
                "name" -> name = reader.textOrNull()
                "stream_icon" -> poster = reader.textOrNull()
                "category_id" -> categoryId = reader.textOrNull()
                "container_extension" -> ext = reader.textOrNull()
                "rating" -> rating = reader.textOrNull()
                "added" -> added = reader.textOrNull()?.toLongOrNull() ?: 0L
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val safeId = id ?: return null
        val label = name?.trim()

        return Movie(
            id = safeId,
            name = if (label.isNullOrEmpty()) safeId else label,
            poster = poster?.takeIf { it.isNotBlank() },
            categoryId = categoryId,
            ext = ext?.takeIf { it.isNotBlank() } ?: "mp4",
            rating = rating?.takeIf { it.isNotBlank() },
            added = added,
        )
    }

    private fun readSeries(reader: JsonReader): Series? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var name: String? = null
        var poster: String? = null
        var categoryId: String? = null
        var rating: String? = null
        var added = 0L

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "series_id" -> id = reader.textOrNull()
                "name" -> name = reader.textOrNull()
                "cover" -> poster = reader.textOrNull()
                "category_id" -> categoryId = reader.textOrNull()
                "rating" -> rating = reader.textOrNull()
                "last_modified" -> added = reader.textOrNull()?.toLongOrNull() ?: 0L
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val safeId = id ?: return null
        val label = name?.trim()

        return Series(
            id = safeId,
            name = if (label.isNullOrEmpty()) safeId else label,
            poster = poster?.takeIf { it.isNotBlank() },
            categoryId = categoryId,
            rating = rating?.takeIf { it.isNotBlank() },
            added = added,
        )
    }

    // The block with plot, cast, poster... (the same names are used for movies and series).
    private fun readInfoBlock(reader: JsonReader): MediaInfo {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return MediaInfo.EMPTY
        }

        var plot: String? = null
        var cast: String? = null
        var director: String? = null
        var genre: String? = null
        var year: String? = null
        var rating: String? = null
        var duration: String? = null
        var backdrop: String? = null
        var poster: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "plot", "description" -> plot = reader.textOrNull()
                "cast", "actors" -> cast = reader.textOrNull()
                "director" -> director = reader.textOrNull()
                "genre" -> genre = reader.textOrNull()
                "releasedate", "releaseDate", "release_date" -> year = reader.textOrNull()
                "rating" -> rating = reader.textOrNull()
                "duration", "episode_run_time" -> duration = reader.textOrNull()
                "backdrop_path", "backdrop" -> backdrop = reader.firstTextOrNull()
                "movie_image", "cover", "cover_big" -> {
                    val value = reader.textOrNull()

                    if (poster == null) poster = value
                }
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        fun clean(value: String?) = value?.trim()?.takeIf { it.isNotEmpty() }

        return MediaInfo(
            plot = clean(plot),
            cast = clean(cast),
            director = clean(director),
            genre = clean(genre),
            year = clean(year)?.take(4)?.takeIf { text -> text.all { it.isDigit() } },
            rating = clean(rating)?.takeIf { it != "0" },
            duration = clean(duration),
            backdrop = clean(backdrop),
            poster = clean(poster),
        )
    }

    private fun readInfoRoot(reader: JsonReader): MediaInfo {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return MediaInfo.EMPTY
        }

        var info = MediaInfo.EMPTY

        reader.beginObject()

        while (reader.hasNext()) {
            if (reader.nextName() == "info") {
                info = readInfoBlock(reader)
            } else {
                reader.skipValue()
            }
        }

        reader.endObject()

        return info
    }

    private fun readSeriesRoot(reader: JsonReader): SeriesInfo {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return SeriesInfo(MediaInfo.EMPTY, emptyMap())
        }

        var info = MediaInfo.EMPTY
        var seasons: Map<Int, List<Episode>> = emptyMap()

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "info" -> info = readInfoBlock(reader)
                "episodes" -> seasons = readEpisodes(reader)
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        return SeriesInfo(info, seasons)
    }

    // Episodes are grouped by season: an object {"1": [...], "2": [...]} (or a list of lists).
    private fun readEpisodes(reader: JsonReader): Map<Int, List<Episode>> {
        val result = TreeMap<Int, MutableList<Episode>>()

        when (reader.peek()) {
            JsonToken.BEGIN_OBJECT -> {
                reader.beginObject()

                while (reader.hasNext()) {
                    val season = reader.nextName().toIntOrNull() ?: 0
                    val list = readArray(reader) { item -> readEpisode(item, season) }

                    result.getOrPut(season) { ArrayList() }.addAll(list)
                }

                reader.endObject()
            }
            JsonToken.BEGIN_ARRAY -> {
                reader.beginArray()

                var season = 1

                while (reader.hasNext()) {
                    val current = season
                    val list = readArray(reader) { item -> readEpisode(item, current) }

                    if (list.isNotEmpty()) result.getOrPut(current) { ArrayList() }.addAll(list)

                    season += 1
                }

                reader.endArray()
            }
            else -> reader.skipValue()
        }

        for (list in result.values) list.sortBy { it.number }

        return result
    }

    private fun readEpisode(reader: JsonReader, defaultSeason: Int): Episode? {
        if (reader.peek() != JsonToken.BEGIN_OBJECT) {
            reader.skipValue()
            return null
        }

        var id: String? = null
        var number = 0
        var title: String? = null
        var ext: String? = null
        var season = defaultSeason
        var duration: String? = null
        var seconds = 0L
        var plot: String? = null
        var image: String? = null

        reader.beginObject()

        while (reader.hasNext()) {
            when (reader.nextName()) {
                "id" -> id = reader.textOrNull()
                "episode_num" -> number = reader.textOrNull()?.toIntOrNull() ?: 0
                "title" -> title = reader.textOrNull()
                "container_extension" -> ext = reader.textOrNull()
                "season" -> season = reader.textOrNull()?.toIntOrNull() ?: defaultSeason
                "info" -> {
                    if (reader.peek() == JsonToken.BEGIN_OBJECT) {
                        reader.beginObject()

                        while (reader.hasNext()) {
                            when (reader.nextName()) {
                                "duration" -> duration = reader.textOrNull()
                                "duration_secs" -> seconds = reader.textOrNull()?.toLongOrNull() ?: 0L
                                "plot" -> plot = reader.textOrNull()
                                "movie_image" -> image = reader.textOrNull()
                                else -> reader.skipValue()
                            }
                        }

                        reader.endObject()
                    } else {
                        reader.skipValue()
                    }
                }
                else -> reader.skipValue()
            }
        }

        reader.endObject()

        val safeId = id ?: return null
        val label = title?.trim()

        return Episode(
            id = safeId,
            season = season,
            number = number,
            title = if (label.isNullOrEmpty()) "S$season E$number" else label,
            ext = ext?.takeIf { it.isNotBlank() } ?: "mkv",
            duration = duration?.takeIf { it.isNotBlank() },
            durationSeconds = seconds,
            plot = plot?.trim()?.takeIf { it.isNotEmpty() },
            image = image?.takeIf { it.isNotBlank() },
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
