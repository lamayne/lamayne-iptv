package com.lamayne.iptv.tv.data

data class Credentials(
    val server: String,
    val user: String,
    val pass: String,
)

data class Category(
    val id: String,
    val name: String,
)

data class Channel(
    val id: String,
    val name: String,
    val icon: String?,
    val categoryId: String?,
)

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
