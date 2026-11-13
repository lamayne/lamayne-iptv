package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import com.lamayne.iptv.tv.data.Secrets
import com.lamayne.iptv.tv.data.Channel
import com.lamayne.iptv.tv.data.EpgEntry
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
    aspect: Int,
    onCycleAspect: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var attempt by remember { mutableStateOf(0) }
    var failure by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf("") }
    var paused by remember { mutableStateOf(false) }
    var buffering by remember { mutableStateOf(true) }
    var overlay by remember { mutableStateOf(true) }
    var touch by remember { mutableLongStateOf(0L) }
    val currentUrls by rememberUpdatedState(urls)
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val exoPlayer = remember { createPlayer(context) }

    // Three passes over the addresses (MPEG-TS, then HLS) before giving up.
    val passes = 3

    fun retryOrFail(reason: String) {
        if (attempt + 1 < currentUrls.size * passes) attempt += 1 else failure = reason
    }

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
                retryOrFail(Secrets.redact("${error.errorCodeName}: ${error.message ?: ""}").orEmpty())
            }

            override fun onTracksChanged(tracks: Tracks) {
                info = describeTracks(tracks)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE
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
        buffering = true
        info = ""
        exoPlayer.setMediaItem(MediaItem.fromUri(currentUrls[0]))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
        reveal()
    }

    // The first address failed: try the next one.
    LaunchedEffect(attempt) {
        if (attempt > 0 && failure == null) {
            delay(1_200)
            exoPlayer.setMediaItem(MediaItem.fromUri(currentUrls[attempt % currentUrls.size]))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }
    }

    // Loading but never starting: after 20 seconds it counts as a failed attempt.
    LaunchedEffect(buffering, attempt, channel.id) {
        if (buffering && failure == null) {
            delay(20_000)

            if (buffering) retryOrFail("Timeout")
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
            update = { view -> view.resizeMode = resizeModeOf(aspect) },
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    keepScreenOn = true
                    isFocusable = false
                    isFocusableInTouchMode = false
                    // one spinner only: ours (the player's own made a second circle)
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    player = exoPlayer
                }
            },
        )

        if (buffering && failure == null) {
            LoadingBadge(
                if (attempt > 0) {
                    stringResource(R.string.player_retrying, attempt + 1, currentUrls.size * passes)
                } else {
                    stringResource(R.string.common_loading)
                },
                Modifier.align(Alignment.Center),
            )
        }

        if (overlay) {
            // ---- top: which channel
            val label = channelLabel(channel.name)

            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color(0xE6000000), Color.Transparent)))
                    .padding(horizontal = 48.dp, vertical = 26.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ChannelLogo(channel, Modifier.size(width = 100.dp, height = 66.dp).padding(4.dp))

                Spacer(Modifier.width(16.dp))

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            label.name,
                            color = Color.White,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )

                        if (label.quality.isNotEmpty()) {
                            Spacer(Modifier.width(12.dp))
                            Text(
                                label.quality,
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .background(Color(0x66FFFFFF), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }

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

            // ---- bottom: one slim row: buttons, what is on now, what comes next
            val nowSeconds = System.currentTimeMillis() / 1000

            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF0000000))))
                    .padding(horizontal = 48.dp, vertical = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RoundButton(onClick = { onZap(-1) }, size = 46.dp) {
                        SkipGlyph(forward = false, color = Color.White, glyphSize = 22.dp)
                    }

                    RoundButton(
                        onClick = { togglePause() },
                        size = 56.dp,
                        accent = true,
                        focusRequester = playFocus,
                    ) {
                        if (paused) {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(30.dp),
                            )
                        } else {
                            PauseGlyph(color = Color.White, glyphSize = 28.dp)
                        }
                    }

                    RoundButton(onClick = { onZap(1) }, size = 46.dp) {
                        SkipGlyph(forward = true, color = Color.White, glyphSize = 22.dp)
                    }

                    RoundButton(onClick = { onToggleFavorite() }, size = 46.dp) {
                        Icon(
                            if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = null,
                            tint = if (favorite) Accent else Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }

                    RoundButton(onClick = onCycleAspect, size = 46.dp) {
                        Text(aspectShort(aspect), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }

                GuideCard(
                    label = stringResource(R.string.guide_now),
                    highlighted = true,
                    entry = epg?.now,
                    nowSeconds = nowSeconds,
                    emptyText = stringResource(R.string.guide_empty),
                    modifier = Modifier.weight(1.5f),
                )

                GuideCard(
                    label = stringResource(R.string.guide_next),
                    highlighted = false,
                    entry = epg?.next,
                    nowSeconds = nowSeconds,
                    emptyText = stringResource(R.string.guide_empty),
                    modifier = Modifier.weight(1f),
                )
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

// "Now" or "Next": a slim card with the time, the title and, for the programme on air,
// a progress bar and the minutes left.
@Composable
private fun GuideCard(
    label: String,
    highlighted: Boolean,
    entry: EpgEntry?,
    nowSeconds: Long,
    emptyText: String,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)

    Column(
        modifier = modifier
            .clip(shape)
            .background(Color(0x99101018))
            .border(1.dp, if (highlighted) Color(0x668B5CF6) else Color(0x22FFFFFF), shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                label.uppercase(),
                color = if (highlighted) AccentBright else Muted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            )

            if (entry != null) {
                Spacer(Modifier.weight(1f))
                Text("${formatClock(entry.start)} - ${formatClock(entry.stop)}", color = Muted, fontSize = 11.sp)
            }
        }

        if (entry == null) {
            Text(emptyText, color = Muted, fontSize = 13.sp, maxLines = 1)
        } else {
            Text(
                entry.title,
                color = Color.White,
                fontSize = if (highlighted) 15.sp else 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            if (highlighted) {
                Spacer(Modifier.height(5.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    ProgressLine(entry.progress(nowSeconds), Modifier.weight(1f))

                    Spacer(Modifier.width(10.dp))

                    val minutes = ((entry.stop - nowSeconds) / 60).coerceAtLeast(0)

                    Text(stringResource(R.string.guide_left, minutes.toInt()), color = Muted, fontSize = 11.sp, maxLines = 1)
                }
            }
        }
    }
}
