package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.ui.PlayerView
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.VodRequest
import kotlinx.coroutines.delay

// Plays a movie or an episode. Remote control:
//  - left / right jump 10 seconds back or forward (the controls need not be shown);
//  - any other key shows the controls: -10 s, play/pause, +10 s, next episode, favourite;
//  - Back hides the controls, then leaves the player. Where you stopped is remembered.
@Composable
fun VodPlayerScreen(
    request: VodRequest,
    url: String,
    favorite: Boolean,
    onToggleFavorite: () -> Unit,
    onProgress: (Long, Long) -> Unit,
    onEnded: () -> Unit,
    onNext: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var failure by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf("") }
    var paused by remember { mutableStateOf(false) }
    var overlay by remember { mutableStateOf(true) }
    var touch by remember { mutableLongStateOf(0L) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val exoPlayer = remember { createPlayer(context) }
    val isEpisode = request.kind == MediaKind.EPISODE

    fun reveal() {
        overlay = true
        touch = System.currentTimeMillis()
    }

    fun togglePause() {
        if (exoPlayer.playWhenReady) exoPlayer.pause() else exoPlayer.play()
    }

    fun seekBy(deltaMs: Long) {
        val limit = if (duration > 0) duration else Long.MAX_VALUE

        exoPlayer.seekTo((exoPlayer.currentPosition + deltaMs).coerceIn(0L, limit))
    }

    BackHandler {
        if (overlay) overlay = false else onBack()
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                failure = "${error.errorCodeName}: ${error.message ?: ""}"
            }

            override fun onTracksChanged(tracks: Tracks) {
                info = describeTracks(tracks)
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                paused = !playWhenReady
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    val total = exoPlayer.duration

                    if (total > 0) onProgress(total, total)

                    onEnded()
                }
            }
        }

        exoPlayer.addListener(listener)

        onDispose {
            val total = exoPlayer.duration

            // Where we stopped is remembered, even when leaving with Back.
            if (total > 0 && total != C.TIME_UNSET) onProgress(exoPlayer.currentPosition, total)

            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(url) {
        failure = null
        exoPlayer.setMediaItem(MediaItem.fromUri(url), request.startMs)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
        reveal()
    }

    // Position and length, twice a second; saved every 5 seconds.
    LaunchedEffect(exoPlayer) {
        var ticks = 0

        while (true) {
            delay(500)

            position = exoPlayer.currentPosition

            val total = exoPlayer.duration

            duration = if (total == C.TIME_UNSET || total < 0) 0L else total
            ticks += 1

            if (ticks >= 10 && duration > 0 && !paused) {
                onProgress(position, duration)
                ticks = 0
            }
        }
    }

    LaunchedEffect(overlay, touch, paused) {
        if (overlay && !paused) {
            delay(6_000)
            overlay = false
        }
    }

    LaunchedEffect(overlay) {
        runCatching {
            if (overlay) playFocus.requestFocus() else rootFocus.requestFocus()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false

                when (event.key) {
                    Key.Back -> false
                    Key.MediaPlayPause, Key.MediaPlay, Key.MediaPause -> {
                        togglePause()
                        reveal()
                        true
                    }
                    Key.MediaFastForward -> {
                        seekBy(30_000)
                        reveal()
                        true
                    }
                    Key.MediaRewind -> {
                        seekBy(-30_000)
                        reveal()
                        true
                    }
                    Key.DirectionLeft -> {
                        if (overlay) {
                            touch = System.currentTimeMillis()
                            false
                        } else {
                            seekBy(-10_000)
                            reveal()
                            true
                        }
                    }
                    Key.DirectionRight -> {
                        if (overlay) {
                            touch = System.currentTimeMillis()
                            false
                        } else {
                            seekBy(10_000)
                            reveal()
                            true
                        }
                    }
                    else -> {
                        if (!overlay) {
                            reveal()
                            true
                        } else {
                            touch = System.currentTimeMillis()
                            false
                        }
                    }
                }
            }
            .focusRequester(rootFocus)
            .focusable(),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    keepScreenOn = true
                    isFocusable = false
                    isFocusableInTouchMode = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    player = exoPlayer
                }
            },
        )

        if (overlay) {
            // ---- top: what is playing
            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color(0xE6000000), Color.Transparent)))
                    .padding(horizontal = 48.dp, vertical = 28.dp),
            ) {
                Text(
                    displayName(request.title),
                    color = Color.White,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                if (request.subtitle != null) {
                    Text(request.subtitle, color = Color(0xFFCFCFE0), fontSize = 16.sp, maxLines = 1)
                }

                if (info.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(info, color = Color(0xFF9A9AB2), fontSize = 13.sp, maxLines = 1)
                }
            }

            // ---- bottom: progress and controls
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF2000000))))
                    .padding(horizontal = 48.dp, vertical = 28.dp),
            ) {
                if (duration > 0) {
                    ProgressLine(
                        (position.toFloat() / duration).coerceIn(0f, 1f),
                        Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(8.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text(formatDuration(position), color = Color.White, fontSize = 15.sp)
                        Spacer(Modifier.weight(1f))
                        Text(
                            "-" + formatDuration((duration - position).coerceAtLeast(0)),
                            color = Color(0xFFB8B8CC),
                            fontSize = 15.sp,
                        )
                    }

                    Spacer(Modifier.height(16.dp))
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RoundButton(onClick = { seekBy(-10_000) }) {
                        Text("-10", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }

                    RoundButton(
                        onClick = { togglePause() },
                        size = 72.dp,
                        accent = true,
                        focusRequester = playFocus,
                    ) {
                        if (paused) {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(40.dp),
                            )
                        } else {
                            PauseGlyph(color = Color.White, glyphSize = 38.dp)
                        }
                    }

                    RoundButton(onClick = { seekBy(10_000) }) {
                        Text("+10", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }

                    if (isEpisode) {
                        RoundButton(onClick = { onNext() }) {
                            SkipGlyph(forward = true, color = Color.White, glyphSize = 30.dp)
                        }
                    }

                    RoundButton(onClick = { onToggleFavorite() }) {
                        Icon(
                            if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = null,
                            tint = if (favorite) Accent else Color.White,
                            modifier = Modifier.size(30.dp),
                        )
                    }

                    Spacer(Modifier.weight(1f))

                    Text(
                        stringResource(R.string.player_hint_vod),
                        color = Color(0xFFB8B8CC),
                        fontSize = 14.sp,
                    )
                }
            }
        }

        failure?.let { message ->
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xEE13131F))
                    .padding(horizontal = 36.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    stringResource(R.string.player_cannot_play_vod),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(message, color = Danger, fontSize = 15.sp)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.player_back_hint), color = Muted, fontSize = 15.sp)
            }
        }
    }
}
