package com.lamayne.iptv.tv.ui

import android.content.Context
import com.lamayne.iptv.tv.R
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.compose.ui.res.stringResource
import androidx.compose.runtime.Composable
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import java.util.Locale
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector

// Fit keeps the picture as it is, zoom fills the screen by cutting the edges (movies with
// black bars), stretch fills the screen by deforming the picture.
fun resizeModeOf(aspect: Int): Int =
    when (aspect) {
        1 -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        2 -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
    }

@Composable
fun aspectShort(aspect: Int): String =
    stringResource(
        when (aspect) {
            1 -> R.string.aspect_zoom_short
            2 -> R.string.aspect_stretch_short
            else -> R.string.aspect_fit_short
        }
    )

@Composable
fun aspectLong(aspect: Int): String =
    stringResource(
        when (aspect) {
            1 -> R.string.aspect_zoom
            2 -> R.string.aspect_stretch
            else -> R.string.aspect_fit
        }
    )

fun createPlayer(context: Context, tunneling: Boolean = false): ExoPlayer {
    val dataSource = DefaultHttpDataSource.Factory()
        .setUserAgent("LAMAYNE-TV/0.4")
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(25_000)

    // Another decoder is tried when the first one fails, and the decoder is fed from a
    // separate thread (fewer dropped frames on heavy pictures).
    val renderers = DefaultRenderersFactory(context)
        .setEnableDecoderFallback(true)
        .forceEnableMediaCodecAsynchronousQueueing()

    // Tunneling (picture and sound synchronised by the hardware) is set on the track selector.
    val selector = DefaultTrackSelector(context)

    if (tunneling) {
        selector.parameters = selector.buildUponParameters()
            .setTunnelingEnabled(true)
            .build()
    }

    return ExoPlayer.Builder(context, renderers)
        .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
        .setTrackSelector(selector)
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

// One audio or subtitle track the viewer can choose.
data class TrackOption(
    val group: Tracks.Group,
    val index: Int,
    val label: String,
    val selected: Boolean,
    val supported: Boolean,
)

private fun trackLabel(format: Format, number: Int, isAudio: Boolean): String {
    val language = format.language
        ?.takeIf { it.isNotBlank() && it != "und" }
        ?.let { code ->
            Locale(code).getDisplayLanguage(Locale.getDefault())
                .replaceFirstChar { char -> char.uppercase() }
        }
    val name = format.label?.takeIf { it.isNotBlank() }
    val codec = if (isAudio) {
        (format.sampleMimeType ?: "").substringAfter('/').uppercase().takeIf { it.isNotBlank() }
    } else {
        null
    }
    val channels = if (isAudio && format.channelCount > 0) "${format.channelCount}ch" else null

    return listOfNotNull(language ?: name ?: "#$number", codec, channels).joinToString("   \u2022   ")
}

// The audio tracks (type = C.TRACK_TYPE_AUDIO) or subtitles (C.TRACK_TYPE_TEXT) of
// the picture being played.
fun trackOptions(tracks: Tracks?, type: Int): List<TrackOption> {
    if (tracks == null) return emptyList()

    val options = ArrayList<TrackOption>()

    for (group in tracks.groups) {
        if (group.type != type) continue

        for (index in 0 until group.length) {
            options.add(
                TrackOption(
                    group = group,
                    index = index,
                    label = trackLabel(group.getTrackFormat(index), options.size + 1, type == C.TRACK_TYPE_AUDIO),
                    selected = group.isTrackSelected(index),
                    supported = group.isTrackSupported(index),
                )
            )
        }
    }

    return options
}

fun selectTrack(player: ExoPlayer, option: TrackOption) {
    if (!option.supported) return

    player.trackSelectionParameters = player.trackSelectionParameters
        .buildUpon()
        .setTrackTypeDisabled(option.group.type, false)
        .setOverrideForType(TrackSelectionOverride(option.group.mediaTrackGroup, option.index))
        .build()
}

fun disableSubtitles(player: ExoPlayer) {
    player.trackSelectionParameters = player.trackSelectionParameters
        .buildUpon()
        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        .build()
}
