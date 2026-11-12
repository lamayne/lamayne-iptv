package com.lamayne.iptv.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

// A plain M3U playlist: Live TV only (channels grouped by "group-title"). The list is
// downloaded once and kept until "update" is pressed.
object M3uClient {
    private const val OTHER = "Other"

    data class Playlist(val channels: List<Channel>, val categories: List<Category>)

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS)
        .build()

    private val ATTRIBUTE = Regex("([A-Za-z0-9_-]+)=\"([^\"]*)\"")

    @Volatile
    private var cachedUrl: String? = null

    @Volatile
    private var cached: Playlist? = null

    fun reset() {
        cached = null
        cachedUrl = null
    }

    suspend fun load(url: String, force: Boolean = false): Playlist =
        withContext(Dispatchers.IO) {
            val known = cached

            if (!force && known != null && cachedUrl == url) return@withContext known

            val request = Request.Builder().url(url).header("User-Agent", "LAMAYNE-TV/0.6").build()
            val playlist = http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw XtreamClient.HttpException(response.code)

                val body = response.body ?: throw IOException("Empty playlist")

                BufferedReader(InputStreamReader(body.byteStream(), Charsets.UTF_8)).use { reader -> parse(reader) }
            }

            if (playlist.channels.isEmpty()) throw IOException("No channel found in this playlist")

            cached = playlist
            cachedUrl = url

            playlist
        }

    suspend fun categories(credentials: Credentials): List<Category> =
        load(credentials.server).categories

    suspend fun channels(credentials: Credentials, categoryId: String): List<Channel> =
        load(credentials.server).channels.filter { (it.categoryId ?: OTHER) == categoryId }

    suspend fun all(credentials: Credentials): List<Channel> =
        load(credentials.server).channels

    private fun parse(reader: BufferedReader): Playlist {
        val channels = ArrayList<Channel>()
        val groups = LinkedHashMap<String, Category>()
        var name: String? = null
        var icon: String? = null
        var group: String? = null

        for (raw in reader.lineSequence()) {
            val line = raw.trim().removePrefix("\uFEFF")

            if (line.isEmpty()) continue

            if (line.startsWith("#EXTINF")) {
                val attributes = ATTRIBUTE.findAll(line).associate { it.groupValues[1].lowercase() to it.groupValues[2] }

                name = attributes["tvg-name"]?.takeIf { it.isNotBlank() }
                    ?: line.substringAfterLast(',', "").trim().takeIf { it.isNotEmpty() }
                icon = attributes["tvg-logo"]?.takeIf { it.isNotBlank() }
                group = attributes["group-title"]?.trim()?.takeIf { it.isNotEmpty() }
            } else if (!line.startsWith("#")) {
                val category = group ?: OTHER

                groups.getOrPut(category) { Category(category, category) }
                channels.add(Channel("m3u${channels.size}", name ?: line, icon, category, line))

                name = null
                icon = null
                group = null
            }
        }

        return Playlist(channels, groups.values.toList())
    }
}
