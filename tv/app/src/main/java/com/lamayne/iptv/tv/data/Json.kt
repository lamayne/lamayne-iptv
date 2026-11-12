package com.lamayne.iptv.tv.data

import org.json.JSONObject

// Small helpers to keep lists of channels, movies, series and progress as JSON.

private fun JSONObject.text(name: String): String? = optString(name).ifEmpty { null }

fun channelToJson(c: Channel): JSONObject =
    JSONObject()
        .put("id", c.id)
        .put("name", c.name)
        .put("icon", c.icon ?: "")
        .put("cat", c.categoryId ?: "")
        .put("url", c.url ?: "")

fun channelFromJson(o: JSONObject): Channel? {
    val id = o.text("id") ?: return null

    return Channel(id, o.optString("name"), o.text("icon"), o.text("cat"), o.text("url"))
}

fun movieToJson(m: Movie): JSONObject =
    JSONObject()
        .put("id", m.id)
        .put("name", m.name)
        .put("poster", m.poster ?: "")
        .put("cat", m.categoryId ?: "")
        .put("ext", m.ext)
        .put("rating", m.rating ?: "")
        .put("added", m.added)

fun movieFromJson(o: JSONObject): Movie? {
    val id = o.text("id") ?: return null

    return Movie(
        id = id,
        name = o.optString("name"),
        poster = o.text("poster"),
        categoryId = o.text("cat"),
        ext = o.text("ext") ?: "mp4",
        rating = o.text("rating"),
        added = o.optLong("added", 0L),
    )
}

fun seriesToJson(s: Series): JSONObject =
    JSONObject()
        .put("id", s.id)
        .put("name", s.name)
        .put("poster", s.poster ?: "")
        .put("cat", s.categoryId ?: "")
        .put("rating", s.rating ?: "")
        .put("added", s.added)

fun seriesFromJson(o: JSONObject): Series? {
    val id = o.text("id") ?: return null

    return Series(
        id = id,
        name = o.optString("name"),
        poster = o.text("poster"),
        categoryId = o.text("cat"),
        rating = o.text("rating"),
        added = o.optLong("added", 0L),
    )
}

fun progressToJson(p: WatchProgress): JSONObject =
    JSONObject()
        .put("key", p.key)
        .put("kind", p.kind.name)
        .put("id", p.id)
        .put("title", p.title)
        .put("subtitle", p.subtitle ?: "")
        .put("image", p.image ?: "")
        .put("ext", p.ext)
        .put("pos", p.position)
        .put("dur", p.duration)
        .put("at", p.updatedAt)
        .put("sid", p.seriesId ?: "")
        .put("sname", p.seriesName ?: "")
        .put("season", p.season)
        .put("number", p.number)

fun progressFromJson(o: JSONObject): WatchProgress? {
    val key = o.text("key") ?: return null
    val kind = try {
        MediaKind.valueOf(o.optString("kind"))
    } catch (e: IllegalArgumentException) {
        return null
    }

    return WatchProgress(
        key = key,
        kind = kind,
        id = o.optString("id"),
        title = o.optString("title"),
        subtitle = o.text("subtitle"),
        image = o.text("image"),
        ext = o.text("ext") ?: "mp4",
        position = o.optLong("pos", 0L),
        duration = o.optLong("dur", 0L),
        updatedAt = o.optLong("at", 0L),
        seriesId = o.text("sid"),
        seriesName = o.text("sname"),
        season = o.optInt("season", 0),
        number = o.optInt("number", 0),
    )
}
