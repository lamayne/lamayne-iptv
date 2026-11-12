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
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.ui.PlayerView
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.EpgInfo
import kotlinx.coroutines.delay

// Plays a live channel. Remote control:
//  - any key shows the controls, which hide by themselves after a few seconds;
//  - up/down (or CH+/CH-) change channel inside the list it was started from;
//  - Back hides the controls, then leaves the player.
@Composable
fun LivePlayerScreen(
    channel: Channel,
    urls: List<String>,
    epg: EpgInfo?,
    favorite: Boolean,
    onToggleFavorite: () -> Unit,
    onZap: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var attempt by remember { mutableStateOf(0) }
    var failure by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf("") }
    var paused by remember { mutableStateOf(false) }
    var overlay by remember { mutableStateOf(true) }
    var touch by remember { mutableLongStateOf(0L) }
    val currentUrls by rememberUpdatedState(urls)
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val exoPlayer = remember { createPlayer(context) }

    fun reveal() {
        overlay = true
        touch = System.currentTimeMillis()
    }

    fun togglePause() {
        if (exoPlayer.playWhenReady) exoPlayer.pause() else exoPlayer.play()
    }

    BackHandler {
        if (overlay) overlay = false else onBack()
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                if (attempt + 1 < currentUrls.size) {
                    attempt += 1
                } else {
                    failure = "${error.errorCodeName}: ${error.message ?: ""}"
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                info = describeTracks(tracks)
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                paused = !playWhenReady
            }
        }

        exoPlayer.addListener(listener)

        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    // A new channel (first one, or after up/down): start it from its first address.
    LaunchedEffect(channel.id) {
        attempt = 0
        failure = null
        info = ""
        exoPlayer.setMediaItem(MediaItem.fromUri(currentUrls[0]))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
        reveal()
    }

    // The first address failed: try the next one.
    LaunchedEffect(attempt) {
        if (attempt > 0 && attempt < currentUrls.size) {
            exoPlayer.setMediaItem(MediaItem.fromUri(currentUrls[attempt]))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }
    }

    // The controls hide by themselves, except while the picture is paused.
    LaunchedEffect(overlay, touch, paused) {
        if (overlay && !paused) {
            delay(6_000)
            overlay = false
        }
    }

    // The cursor is on the Play button when the controls are shown; otherwise on
    // an invisible element that only listens to the keys.
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
                    Key.DirectionUp, Key.ChannelDown -> {
                        onZap(-1)
                        true
                    }
                    Key.DirectionDown, Key.ChannelUp -> {
                        onZap(1)
                        true
                    }
                    Key.MediaPlayPause, Key.MediaPlay, Key.MediaPause -> {
                        togglePause()
                        reveal()
                        true
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
            // ---- top: which channel
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color(0xE6000000), Color.Transparent)))
                    .padding(horizontal = 48.dp, vertical = 28.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 96.dp, height = 64.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0x33FFFFFF)),
                ) {
                    ChannelLogo(channel, Modifier.fillMaxSize().padding(8.dp))
                }

                Spacer(Modifier.width(18.dp))

                Column {
                    Text(
                        displayName(channel.name),
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Spacer(Modifier.height(6.dp))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LiveBadge()

                        if (info.isNotEmpty()) {
                            Spacer(Modifier.width(12.dp))
                            Text(info, color = Color(0xFFCFCFE0), fontSize = 14.sp, maxLines = 1)
                        }
                    }
                }
            }

            // ---- bottom: programme and controls
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF2000000))))
                    .padding(horizontal = 48.dp, vertical = 28.dp),
            ) {
                val now = epg?.now

                if (now != null) {
                    val nowSeconds = System.currentTimeMillis() / 1000

                    Text(
                        "${formatClock(now.start)} - ${formatClock(now.stop)}   ${now.title}",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Spacer(Modifier.height(10.dp))

                    ProgressLine(now.progress(nowSeconds), Modifier.fillMaxWidth())

                    val next = epg?.next

                    if (next != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.live_next) + "  ${formatClock(next.start)}   ${next.title}",
                            color = Color(0xFFB8B8CC),
                            fontSize = 16.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Spacer(Modifier.height(20.dp))
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RoundButton(onClick = { onZap(-1) }) {
                        SkipGlyph(forward = false, color = Color.White, glyphSize = 30.dp)
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

                    RoundButton(onClick = { onZap(1) }) {
                        SkipGlyph(forward = true, color = Color.White, glyphSize = 30.dp)
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
                        stringResource(R.string.player_hint_live),
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
                    stringResource(R.string.player_cannot_play),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(message, color = Danger, fontSize = 15.sp)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.player_try_other), color = Muted, fontSize = 15.sp)
            }
        }
    }
}
