package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import kotlinx.coroutines.delay

// Plays one live channel. The first address is tried, then the next one if the
// player reports an error. The format of the picture and the sound is shown for
// a few seconds: it tells at once when a codec is not supported by the TV.
@Composable
fun PlayerScreen(title: String, urls: List<String>, onBack: () -> Unit) {
    val context = LocalContext.current
    var attempt by remember { mutableIntStateOf(0) }
    var failure by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf("") }
    var showInfo by remember { mutableStateOf(true) }

    val exoPlayer = remember {
        val dataSource = DefaultHttpDataSource.Factory()
            .setUserAgent("LAMAYNE-TV/0.1")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)

        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .build()
    }

    BackHandler { onBack() }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                if (attempt + 1 < urls.size) {
                    attempt += 1
                } else {
                    failure = "${error.errorCodeName}: ${error.message ?: ""}"
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                info = describeTracks(tracks)
            }
        }

        exoPlayer.addListener(listener)

        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(attempt) {
        failure = null
        exoPlayer.setMediaItem(MediaItem.fromUri(urls[attempt]))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    LaunchedEffect(info) {
        if (info.isNotEmpty()) {
            showInfo = true
            delay(10_000)
            showInfo = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    keepScreenOn = true
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    player = exoPlayer
                }
            },
        )

        if (showInfo || failure != null) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(32.dp)
                    .background(Color(0xCC000000))
                    .padding(16.dp),
            ) {
                Text(title, color = Color.White)

                if (info.isNotEmpty()) {
                    Text(info, color = Muted)
                }

                failure?.let { message ->
                    Text("Cannot play this channel: $message", color = ErrorText)
                    Text("Press Back to return to the list.", color = Muted)
                }
            }
        }
    }
}

private fun describeTracks(tracks: Tracks): String {
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
