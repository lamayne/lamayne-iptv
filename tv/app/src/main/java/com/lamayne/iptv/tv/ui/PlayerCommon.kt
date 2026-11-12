package com.lamayne.iptv.tv.ui

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

fun createPlayer(context: Context): ExoPlayer {
    val dataSource = DefaultHttpDataSource.Factory()
        .setUserAgent("LAMAYNE-TV/0.2")
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(25_000)

    return ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
        .build()
}

// "Video video/avc 1920x1080 | Audio audio/ac3 6ch": tells at once when a codec
// is not supported by the TV.
fun describeTracks(tracks: Tracks): String {
    val parts = ArrayList<String>()
    val otherAudio = ArrayList<String>()

    for (group in tracks.groups) {
        if (group.length == 0) continue

        val format = group.getTrackFormat(0)
        val mime = format.sampleMimeType ?: "?"

        if (group.type == C.TRACK_TYPE_VIDEO && group.isSelected) {
            parts.add("Video $mime ${format.width}x${format.height}")
        } else if (group.type == C.TRACK_TYPE_AUDIO) {
            if (group.isSelected) {
                parts.add("Audio $mime ${format.channelCount}ch")
            } else {
                otherAudio.add(mime)
            }
        }
    }

    if (otherAudio.isNotEmpty()) {
        parts.add("Other audio tracks: " + otherAudio.joinToString())
    }

    return parts.joinToString("   |   ")
}
