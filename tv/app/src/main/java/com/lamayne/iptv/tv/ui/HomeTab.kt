package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.Featured
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.UiError
import com.lamayne.iptv.tv.data.WatchProgress
import kotlinx.coroutines.delay

@Composable
fun HomeTab(viewModel: MainViewModel) {
    val featured by viewModel.featured.collectAsStateWithLifecycle()
    val latestMovies by viewModel.latestMovies.collectAsStateWithLifecycle()
    val latestSeries by viewModel.latestSeries.collectAsStateWithLifecycle()
    val favChannels by viewModel.favChannels.collectAsStateWithLifecycle()
    val favMovies by viewModel.favMovies.collectAsStateWithLifecycle()
    val favSeries by viewModel.favSeries.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val loading by viewModel.homeLoading.collectAsStateWithLifecycle()
    val error by viewModel.homeError.collectAsStateWithLifecycle()
    val continueItems = remember(progress) {
        progress.filter { it.inProgress }.sortedByDescending { it.updatedAt }.take(20)
    }
    var pendingResume by remember { mutableStateOf<WatchProgress?>(null) }
    val heroFocus = remember { FocusRequester() }
    val epgMap by viewModel.epgMap.collectAsStateWithLifecycle()
    val epgVersion by viewModel.epgVersion.collectAsStateWithLifecycle()

    // The favourite channels show what is on now.
    LaunchedEffect(favChannels, epgVersion) {
        favChannels.take(30).forEach { viewModel.requestEpg(it.id) }
    }

    LaunchedEffect(featured.isNotEmpty()) {
        if (featured.isNotEmpty()) runCatching { heroFocus.requestFocus() }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 4.dp, bottom = 56.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Hero(
                featured = featured,
                loading = loading,
                error = error,
                requester = heroFocus,
                onRetry = { viewModel.retry(Tab.HOME) },
                // "Play" opens the page of the movie or series: Play, Resume and the
                // rest are there.
                onOpen = { slide ->
                    val movie = slide.movie

                    if (movie != null) viewModel.openMovie(movie)
                    else slide.series?.let { viewModel.openSeries(it) }
                },
            )
        }

        if (continueItems.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_continue), continueItems) { item ->
                    WideCard(
                        title = displayName(item.seriesName ?: item.title),
                        subtitle = if (item.kind == MediaKind.EPISODE) {
                            "S${item.season} E${item.number}  \u2022  ${item.title}"
                        } else {
                            null
                        },
                        image = item.image,
                        progress = item.fraction,
                        modifier = Modifier.width(230.dp),
                        onClick = { pendingResume = item },
                    )
                }
            }
        }

        if (favChannels.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_my_channels), favChannels) { channel ->
                    val now = epgMap[channel.id]?.now

                    ChannelTile(
                        channel = channel,
                        modifier = Modifier.width(132.dp),
                        nowTitle = now?.title,
                        nowProgress = now?.progress(System.currentTimeMillis() / 1000),
                        onClick = { viewModel.playLive(channel, favChannels) },
                    )
                }
            }
        }

        if (favMovies.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_my_movies), favMovies) { movie ->
                    PosterCard(
                        title = displayName(movie.name),
                        image = movie.poster,
                        modifier = Modifier.width(140.dp),
                        rating = ratingText(movie.rating),
                        onClick = { viewModel.openMovie(movie) },
                    )
                }
            }
        }

        if (favSeries.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_my_series), favSeries) { series ->
                    PosterCard(
                        title = displayName(series.name),
                        image = series.poster,
                        modifier = Modifier.width(140.dp),
                        rating = ratingText(series.rating),
                        onClick = { viewModel.openSeries(series) },
                    )
                }
            }
        }

        if (latestMovies.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_latest_movies), latestMovies) { movie ->
                    PosterCard(
                        title = displayName(movie.name),
                        image = movie.poster,
                        modifier = Modifier.width(140.dp),
                        rating = ratingText(movie.rating),
                        onClick = { viewModel.openMovie(movie) },
                    )
                }
            }
        }

        if (latestSeries.isNotEmpty()) {
            item {
                ContentRow(stringResource(R.string.home_latest_series), latestSeries) { series ->
                    PosterCard(
                        title = displayName(series.name),
                        image = series.poster,
                        modifier = Modifier.width(140.dp),
                        rating = ratingText(series.rating),
                        onClick = { viewModel.openSeries(series) },
                    )
                }
            }
        }
    }

    pendingResume?.let { item ->
        ResumeDialog(
            title = displayName(item.seriesName ?: item.title),
            positionMs = item.position,
            onResume = {
                pendingResume = null
                viewModel.resume(item)
            },
            onRestart = {
                pendingResume = null
                viewModel.resume(item, fromStart = true)
            },
            onDismiss = { pendingResume = null },
        )
    }
}

// The big banner: one movie or series at a time, on a rounded card. It changes by
// itself every few seconds, and left / right change it by hand.
@Composable
private fun Hero(
    featured: List<Featured>,
    loading: Boolean,
    error: UiError?,
    requester: FocusRequester,
    onRetry: () -> Unit,
    onOpen: (Featured) -> Unit,
) {
    var index by remember { mutableStateOf(0) }
    val count = featured.size

    // Starts again after every change, so a change made by hand is not undone at once.
    LaunchedEffect(index, count) {
        if (count > 1) {
            delay(9_000)
            index = (index + 1) % count
        }
    }

    if (featured.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(190.dp),
            contentAlignment = Alignment.Center,
        ) {
            when {
                error != null -> MessageBlock(
                    title = stringResource(R.string.error_load_title),
                    hint = error.errorText(),
                    actionLabel = stringResource(R.string.common_retry),
                    onAction = onRetry,
                )
                loading -> Text(stringResource(R.string.home_preparing), color = Muted, fontSize = 18.sp)
                else -> Text(stringResource(R.string.home_nothing), color = Muted, fontSize = 18.sp)
            }
        }

        return
    }

    val slide = featured[index % count]
    val shape = RoundedCornerShape(28.dp)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp)
            .height(330.dp)
            .clip(shape)
            .border(1.dp, Color(0x26FFFFFF), shape)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || count < 2) {
                    false
                } else {
                    when (event.key) {
                        Key.DirectionRight -> {
                            index = (index + 1) % count
                            true
                        }
                        Key.DirectionLeft -> {
                            index = (index - 1 + count) % count
                            true
                        }
                        else -> false
                    }
                }
            },
    ) {
        // The top of the picture stays visible: only the bottom is cut when it is too tall.
        PosterImage(slide.backdrop, slide.title, Modifier.fillMaxSize(), alignment = BiasAlignment(0f, -0.7f))

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        listOf(Color(0xF50A0A12), Color(0xCC0A0A12), Color(0x330A0A12), Color.Transparent)
                    )
                ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC0A0A12)))),
        )

        // The text sits at the bottom of the card: the title is always visible.
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 36.dp, bottom = 28.dp)
                .width(520.dp),
        ) {
            Text(
                stringResource(
                    if (slide.kind == MediaKind.MOVIE) R.string.kind_movie else R.string.kind_series
                ).uppercase(),
                color = AccentBright,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 3.sp,
            )

            Spacer(Modifier.height(4.dp))

            Text(
                displayName(slide.title),
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 36.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            if (slide.meta.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (chip in slide.meta.split("  \u2022  ").take(4)) {
                        Text(
                            chip,
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            modifier = Modifier
                                .background(Color(0x33FFFFFF), RoundedCornerShape(50))
                                .padding(horizontal = 10.dp, vertical = 3.dp),
                        )
                    }
                }
            }

            if (!slide.plot.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    slide.plot,
                    color = Color(0xFFE0E0EC),
                    fontSize = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(16.dp))

            ActionButton(
                text = stringResource(R.string.details_play),
                onClick = { onOpen(slide) },
                primary = true,
                focusRequester = requester,
                icon = {
                    Icon(
                        Icons.Filled.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                },
            )
        }

        // Which banner is shown.
        if (count > 1) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 32.dp, bottom = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                for (position in 0 until count) {
                    Box(
                        modifier = Modifier
                            .size(width = if (position == index % count) 22.dp else 8.dp, height = 8.dp)
                            .clip(RoundedCornerShape(50))
                            .background(if (position == index % count) Accent else Color(0x66FFFFFF)),
                    )
                }
            }
        }
    }
}
