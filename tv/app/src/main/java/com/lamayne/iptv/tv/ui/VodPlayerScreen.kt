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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
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
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.ui.PlayerView
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.VodRequest
import kotlinx.coroutines.delay

// Plays a movie or an episode. Remote control:
//  - left / right jump 10 seconds back or forward (the controls need not be shown);
//  - any other key shows the controls; up reaches the position bar, where left / right
//    move to any place in the movie; below it: -10 s, play/pause, +10 s, next
//    episode, audio, subtitles, favourite;
//  - Back closes the audio / subtitles list, then hides the controls, then leaves
//    the player. Where you stopped is remembered.
@Composable
fun VodPlayerScreen(
    request: VodRequest,
    url: String,
    favorite: Boolean,
    onToggleFavorite: () -> Unit,
    aspect: Int,
    onCycleAspect: () -> Unit,
    tunneling: Boolean,
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
    var tracks by remember { mutableStateOf<Tracks?>(null) }
    // 0 = nothing, 1 = audio tracks, 2 = subtitles
    var picker by remember { mutableStateOf(0) }
    var previousPicker by remember { mutableStateOf(0) }
    var buffering by remember { mutableStateOf(true) }
    var dropped by remember { mutableStateOf(0) }
    val audioFocus = remember { FocusRequester() }
    val subFocus = remember { FocusRequester() }
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val exoPlayer = remember { createPlayer(context, tunneling) }
    val isEpisode = request.kind == MediaKind.EPISODE
    val audioOptions = remember(tracks) { trackOptions(tracks, C.TRACK_TYPE_AUDIO) }
    val textOptions = remember(tracks) { trackOptions(tracks, C.TRACK_TYPE_TEXT) }

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

    // Declared after the one above: it is the first to answer Back.
    BackHandler(enabled = picker != 0) {
        picker = 0
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                failure = "${error.errorCodeName}: ${error.message ?: ""}"
            }

            override fun onTracksChanged(newTracks: Tracks) {
                tracks = newTracks
                info = describeTracks(newTracks)
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                paused = !playWhenReady
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE

                if (playbackState == Player.STATE_ENDED) {
                    val total = exoPlayer.duration

                    if (total > 0) onProgress(total, total)

                    onEnded()
                }
            }
        }

        exoPlayer.addListener(listener)

        // Frames the TV could not show in time: tells a heavy picture from a slow network.
        val analytics = object : AnalyticsListener {
            override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
                dropped += droppedFrames
            }
        }

        exoPlayer.addAnalyticsListener(analytics)

        onDispose {
            exoPlayer.removeAnalyticsListener(analytics)
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

    // The controls stay while the picture is paused or a list is open.
    LaunchedEffect(overlay, touch, paused, picker) {
        if (overlay && !paused && picker == 0) {
            delay(6_000)
            overlay = false
        }
    }

    LaunchedEffect(overlay) {
        runCatching {
            if (overlay) playFocus.requestFocus() else rootFocus.requestFocus()
        }
    }

    // Closing the audio / subtitles list: the cursor goes back to the button that opened it
    // (without this it was lost and nothing could be selected any more).
    LaunchedEffect(picker) {
        if (picker == 0 && previousPicker != 0) {
            delay(60)
            runCatching { (if (previousPicker == 1) audioFocus else subFocus).requestFocus() }
        }

        previousPicker = picker
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false

                // While an audio / subtitles list is open, the keys move inside it.
                if (picker != 0) return@onPreviewKeyEvent false

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
            update = { view -> view.resizeMode = resizeModeOf(aspect) },
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    keepScreenOn = true
                    isFocusable = false
                    isFocusableInTouchMode = false
                    // one spinner only: ours
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    player = exoPlayer
                }
            },
        )

        if (buffering && failure == null) {
            LoadingBadge(stringResource(R.string.common_loading), Modifier.align(Alignment.Center))
        }

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

                val infoLine = if (dropped > 0) {
                    info + "   |   " + stringResource(R.string.player_dropped, dropped)
                } else {
                    info
                }

                if (infoLine.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(infoLine, color = Color(0xFF9A9AB2), fontSize = 13.sp, maxLines = 1)
                }
            }

            // ---- bottom: position bar and controls
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF2000000))))
                    .padding(horizontal = 48.dp, vertical = 24.dp),
            ) {
                if (duration > 0) {
                    SeekBar(position, duration, onSeekBy = { seekBy(it) })

                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text(formatDuration(position), color = Color.White, fontSize = 15.sp)
                        Spacer(Modifier.weight(1f))
                        Text(
                            "-" + formatDuration((duration - position).coerceAtLeast(0)),
                            color = Color(0xFFB8B8CC),
                            fontSize = 15.sp,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
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

                    ActionButton(
                        text = stringResource(R.string.player_audio) + "  " + audioOptions.size,
                        onClick = { picker = 1 },
                        focusRequester = audioFocus,
                    )

                    ActionButton(
                        text = stringResource(R.string.player_subtitles) + "  " + textOptions.size,
                        onClick = { picker = 2 },
                        focusRequester = subFocus,
                    )

                    // Picture framing: a small round button (the long label pushed the heart out)
                    RoundButton(onClick = onCycleAspect) {
                        Text(aspectShort(aspect), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    RoundButton(onClick = { onToggleFavorite() }) {
                        Icon(
                            if (favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = null,
                            tint = if (favorite) Accent else Color.White,
                            modifier = Modifier.size(30.dp),
                        )
                    }
                }

            }
        }

        // ---- audio / subtitles list
        if (picker != 0) {
            val isAudio = picker == 1

            TrackPanel(
                title = stringResource(if (isAudio) R.string.player_audio else R.string.player_subtitles),
                options = if (isAudio) audioOptions else textOptions,
                offLabel = if (isAudio || textOptions.isEmpty()) null else stringResource(R.string.player_off),
                offSelected = !isAudio && textOptions.none { it.selected },
                emptyLabel = stringResource(if (isAudio) R.string.player_no_audio else R.string.player_no_subtitles),
                unsupportedLabel = stringResource(R.string.player_unsupported),
                closeLabel = stringResource(R.string.player_close),
                onClose = { picker = 0 },
                onOff = {
                    disableSubtitles(exoPlayer)
                    picker = 0
                    reveal()
                },
                onPick = { option ->
                    selectTrack(exoPlayer, option)
                    picker = 0
                    reveal()
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
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

// The position bar. When the cursor is on it, left / right move to any place in the
// movie (10 seconds a press, faster when the key is held).
@Composable
private fun SeekBar(position: Long, duration: Long, onSeekBy: (Long) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val fraction = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(30.dp)
            .onFocusChanged { focused = it.isFocused }
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false

                val repeats = event.nativeKeyEvent.repeatCount
                val step = when {
                    repeats > 15 -> 60_000L
                    repeats > 5 -> 30_000L
                    else -> 10_000L
                }

                when (event.key) {
                    Key.DirectionLeft -> {
                        onSeekBy(-step)
                        true
                    }
                    Key.DirectionRight -> {
                        onSeekBy(step)
                        true
                    }
                    else -> false
                }
            }
            .focusable(),
        contentAlignment = Alignment.CenterStart,
    ) {
        val trackHeight = if (focused) 10.dp else 5.dp

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(trackHeight)
                .clip(RoundedCornerShape(5.dp))
                .background(Color(0x40FFFFFF)),
        )

        Box(
            modifier = Modifier
                .fillMaxWidth(fraction)
                .height(trackHeight)
                .clip(RoundedCornerShape(5.dp))
                .background(Accent),
        )

        if (focused) {
            Box(
                modifier = Modifier.fillMaxWidth(fraction),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                )
            }
        }
    }
}

@Composable
private fun TrackPanel(
    title: String,
    options: List<TrackOption>,
    offLabel: String?,
    offSelected: Boolean,
    emptyLabel: String,
    unsupportedLabel: String,
    closeLabel: String,
    onClose: () -> Unit,
    onOff: () -> Unit,
    onPick: (TrackOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    val first = remember { FocusRequester() }
    var focusedIndex by remember { mutableStateOf(0) }
    val total = options.size + (if (offLabel != null) 1 else 0)

    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }

    Column(
        modifier = modifier
            .padding(32.dp)
            .width(420.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xF013131F))
            .padding(22.dp)
            // The cursor stays inside the list: Down on the last line, Up on the first and
            // left / right do nothing (before, they moved to the controls behind the list).
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) {
                    false
                } else {
                    when (event.key) {
                        Key.DirectionDown -> focusedIndex >= total - 1
                        Key.DirectionUp -> focusedIndex <= 0
                        Key.DirectionLeft, Key.DirectionRight -> true
                        else -> false
                    }
                }
            },
    ) {
        Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)

        Spacer(Modifier.height(14.dp))

        if (options.isEmpty()) {
            // Nothing to choose: say it, and keep a button so the cursor has somewhere to be.
            Text(emptyLabel, color = Muted, fontSize = 16.sp)

            Spacer(Modifier.height(16.dp))

            ActionButton(text = closeLabel, onClick = onClose, focusRequester = first)
        } else {
            LazyColumn(
                modifier = Modifier.heightIn(max = 300.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (offLabel != null) {
                    item {
                        TrackRow(offLabel, offSelected, true, first, onOff, onFocused = { focusedIndex = 0 })
                    }
                }

                itemsIndexed(options) { index, option ->
                    TrackRow(
                        label = if (option.supported) option.label else option.label + "   \u2022   " + unsupportedLabel,
                        selected = option.selected,
                        enabled = option.supported,
                        focusRequester = if (offLabel == null && index == 0) first else null,
                        onClick = { onPick(option) },
                        onFocused = { focusedIndex = index + (if (offLabel != null) 1 else 0) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TrackRow(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    focusRequester: FocusRequester?,
    onClick: () -> Unit,
    onFocused: () -> Unit = {},
) {
    FocusCard(
        onClick = { if (enabled) onClick() },
        onFocused = onFocused,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        focusedScale = 1.02f,
        focusRequester = focusRequester,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(if (selected) Accent else Color(0x33FFFFFF)),
            )

            Spacer(Modifier.width(14.dp))

            Text(
                label,
                color = if (enabled) TextMain else Color(0xFF7A7A90),
                fontSize = 16.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
