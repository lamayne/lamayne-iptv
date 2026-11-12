package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import kotlinx.coroutines.delay

@Composable
fun HomeTab(viewModel: MainViewModel) {
    val featured by viewModel.featured.collectAsStateWithLifecycle()
    val latestMovies by viewModel.latestMovies.collectAsStateWithLifecycle()
    val latestSeries by viewModel.latestSeries.collectAsStateWithLifecycle()
    val favChannels by viewModel.favChannels.collectAsStateWithLifecycle()
    val recents by viewModel.recents.collectAsStateWithLifecycle()
    val favMovies by viewModel.favMovies.collectAsStateWithLifecycle()
    val favSeries by viewModel.favSeries.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val loading by viewModel.homeLoading.collectAsStateWithLifecycle()
    val error by viewModel.homeError.collectAsStateWithLifecycle()
    val continueItems = remember(progress) {
        progress.filter { it.inProgress }.sortedByDescending { it.updatedAt }.take(20)
    }
    val favoriteChannelIds = remember(favChannels) { favChannels.map { it.id }.toSet() }
    val heroFocus = remember { FocusRequester() }

    LaunchedEffect(featured.isNotEmpty()) {
        if (featured.isNotEmpty()) runCatching { heroFocus.requestFocus() }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 48.dp),
    ) {
        item {
            Hero(
                featured = featured,
                loading = loading,
                error = error,
                requester = heroFocus,
                onRetry = { viewModel.retry(Tab.HOME) },
                onPlay = { slide ->
                    val movie = slide.movie

                    if (movie != null) viewModel.playMovie(movie, resume = true)
                    else slide.series?.let { viewModel.openSeries(it) }
                },
                onDetails = { slide ->
                    val movie = slide.movie

                    if (movie != null) viewModel.openMovie(movie)
                    else slide.series?.let { viewModel.openSeries(it) }
                },
            )
        }

        item {
            ContentRow(stringResource(R.string.home_continue), continueItems) { item ->
                WideCard(
                    title = displayName(item.seriesName ?: item.title),
                    subtitle = if (item.kind == MediaKind.EPISODE) "S${item.season} E${item.number}  \u2022  ${item.title}" else null,
                    image = item.image,
                    progress = item.fraction,
                    modifier = Modifier.width(250.dp),
                    onClick = { viewModel.resume(item) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_my_channels), favChannels) { channel ->
                ChannelTile(
                    channel = channel,
                    modifier = Modifier.width(190.dp),
                    favorite = true,
                    onClick = { viewModel.playLive(channel, favChannels) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_recent_channels), recents) { channel ->
                ChannelTile(
                    channel = channel,
                    modifier = Modifier.width(190.dp),
                    favorite = favoriteChannelIds.contains(channel.id),
                    onClick = { viewModel.playLive(channel, recents) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_my_movies), favMovies) { movie ->
                PosterCard(
                    title = displayName(movie.name),
                    image = movie.poster,
                    modifier = Modifier.width(150.dp),
                    rating = ratingText(movie.rating),
                    onClick = { viewModel.openMovie(movie) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_my_series), favSeries) { series ->
                PosterCard(
                    title = displayName(series.name),
                    image = series.poster,
                    modifier = Modifier.width(150.dp),
                    rating = ratingText(series.rating),
                    onClick = { viewModel.openSeries(series) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_latest_movies), latestMovies) { movie ->
                PosterCard(
                    title = displayName(movie.name),
                    image = movie.poster,
                    modifier = Modifier.width(150.dp),
                    rating = ratingText(movie.rating),
                    onClick = { viewModel.openMovie(movie) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.home_latest_series), latestSeries) { series ->
                PosterCard(
                    title = displayName(series.name),
                    image = series.poster,
                    modifier = Modifier.width(150.dp),
                    rating = ratingText(series.rating),
                    onClick = { viewModel.openSeries(series) },
                )
            }
        }
    }
}

// The big banner: one movie or series at a time, changing every few seconds.
@Composable
private fun Hero(
    featured: List<Featured>,
    loading: Boolean,
    error: UiError?,
    requester: FocusRequester,
    onRetry: () -> Unit,
    onPlay: (Featured) -> Unit,
    onDetails: (Featured) -> Unit,
) {
    var index by remember { mutableStateOf(0) }
    val count = featured.size

    LaunchedEffect(count) {
        if (count > 1) {
            while (true) {
                delay(9_000)
                index = (index + 1) % count
            }
        }
    }

    if (featured.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp),
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

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(340.dp),
    ) {
        PosterImage(slide.backdrop, slide.title, Modifier.fillMaxSize())

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        listOf(Color(0xF00A0A12), Color(0xB00A0A12), Color.Transparent)
                    )
                ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF0A0A12)))),
        )

        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 48.dp)
                .width(580.dp),
        ) {
            Text(
                stringResource(
                    if (slide.kind == MediaKind.MOVIE) R.string.kind_movie else R.string.kind_series
                ).uppercase(),
                color = AccentBright,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            )

            Spacer(Modifier.height(6.dp))

            Text(
                displayName(slide.title),
                color = Color.White,
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            if (slide.meta.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(slide.meta, color = Color(0xFFD0D0E0), fontSize = 15.sp, maxLines = 1)
            }

            if (!slide.plot.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    slide.plot,
                    color = Color(0xFFE0E0EC),
                    fontSize = 15.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(18.dp))

            Row {
                ActionButton(
                    text = stringResource(
                        if (slide.kind == MediaKind.MOVIE) R.string.details_play else R.string.home_open_series
                    ),
                    onClick = { onPlay(slide) },
                    primary = true,
                    focusRequester = requester,
                    icon = {
                        if (slide.kind == MediaKind.MOVIE) {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    },
                )

                if (slide.kind == MediaKind.MOVIE) {
                    Spacer(Modifier.width(12.dp))
                    ActionButton(
                        text = stringResource(R.string.home_details),
                        onClick = { onDetails(slide) },
                    )
                }
            }
        }
    }
}
