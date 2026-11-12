package com.lamayne.iptv.tv.data

enum class MediaKind { LIVE, MOVIE, SERIES, EPISODE }

data class Credentials(
    val server: String,
    val user: String,
    val pass: String,
)

// A plain M3U playlist is stored as an account whose address is the link of the playlist.
const val M3U_USER = "m3u"

val Credentials.isM3u: Boolean
    get() = user == M3U_USER && pass.isEmpty()

data class Category(
    val id: String,
    val name: String,
)

data class Channel(
    val id: String,
    val name: String,
    val icon: String?,
    val categoryId: String?,
    // Only for playlists (M3U): the address of the stream.
    val url: String? = null,
)

data class Movie(
    val id: String,
    val name: String,
    val poster: String?,
    val categoryId: String?,
    val ext: String,
    val rating: String?,
    val added: Long,
)

data class Series(
    val id: String,
    val name: String,
    val poster: String?,
    val categoryId: String?,
    val rating: String?,
    val added: Long,
)

// What the provider knows about a movie or a series.
data class MediaInfo(
    val plot: String?,
    val cast: String?,
    val director: String?,
    val genre: String?,
    val year: String?,
    val rating: String?,
    val duration: String?,
    val backdrop: String?,
    val poster: String?,
) {
    companion object {
        val EMPTY = MediaInfo(null, null, null, null, null, null, null, null, null)
    }
}

data class Episode(
    val id: String,
    val season: Int,
    val number: Int,
    val title: String,
    val ext: String,
    val duration: String?,
    val durationSeconds: Long,
    val plot: String?,
    val image: String?,
)

data class SeriesInfo(
    val info: MediaInfo,
    val seasons: Map<Int, List<Episode>>,
)

// A movie or an episode to play, with what is needed to remember where it stopped.
data class VodRequest(
    val kind: MediaKind,
    val id: String,
    val title: String,
    val subtitle: String?,
    val image: String?,
    val ext: String,
    val startMs: Long,
    val seriesId: String? = null,
    val seriesName: String? = null,
    val season: Int = 0,
    val number: Int = 0,
    val categoryId: String? = null,
)

// Where a movie or an episode stopped. Times are milliseconds.
data class WatchProgress(
    val key: String,
    val kind: MediaKind,
    val id: String,
    val title: String,
    val subtitle: String?,
    val image: String?,
    val ext: String,
    val position: Long,
    val duration: Long,
    val updatedAt: Long,
    val seriesId: String?,
    val seriesName: String?,
    val season: Int,
    val number: Int,
) {
    val fraction: Float
        get() = if (duration <= 0) 0f else (position.toFloat() / duration).coerceIn(0f, 1f)

    // Started, not finished: worth proposing "continue watching".
    val inProgress: Boolean
        get() = duration > 0 && position >= 20_000 && fraction <= 0.94f

    val finished: Boolean
        get() = duration > 0 && fraction > 0.94f

    companion object {
        fun keyOf(kind: MediaKind, id: String) = "${kind.name.lowercase()}:$id"
    }
}

// One programme of the guide. Times are Unix seconds.
data class EpgEntry(
    val title: String,
    val start: Long,
    val stop: Long,
) {
    fun progress(nowSeconds: Long): Float =
        if (stop <= start) 0f else ((nowSeconds - start).toFloat() / (stop - start)).coerceIn(0f, 1f)
}

// What is on now and what comes next. Both null = the guide has nothing for this channel.
data class EpgInfo(
    val now: EpgEntry?,
    val next: EpgEntry?,
) {
    companion object {
        val EMPTY = EpgInfo(null, null)

        fun from(entries: List<EpgEntry>, nowSeconds: Long): EpgInfo {
            val sorted = entries.sortedBy { it.start }
            val now = sorted.firstOrNull { it.start <= nowSeconds && nowSeconds < it.stop }
            val after = now?.stop ?: nowSeconds
            val next = sorted.firstOrNull { it.start >= after }

            return EpgInfo(now, next)
        }
    }
}

// A highlighted movie or series on the home page.
data class Featured(
    val kind: MediaKind,
    val movie: Movie?,
    val series: Series?,
    val title: String,
    val backdrop: String?,
    val meta: String,
    val plot: String?,
)

sealed interface Loadable<out T> {
    data object Loading : Loadable<Nothing>
    data class Ready<T>(val value: T) : Loadable<T>
    data class Failed(val error: UiError) : Loadable<Nothing>
}

// Errors are kept as codes: the screens turn them into text in the chosen language.
sealed interface UiError {
    data object FillFields : UiError
    data object AuthRefused : UiError
    data object InvalidAddress : UiError
    data object ServerNotFound : UiError
    data object Timeout : UiError
    data class Http(val code: Int) : UiError
    data class Other(val text: String?) : UiError
}
