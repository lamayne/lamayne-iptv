package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.lamayne.iptv.tv.data.Episode
import com.lamayne.iptv.tv.data.Loadable
import com.lamayne.iptv.tv.data.MediaInfo
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.Movie
import com.lamayne.iptv.tv.data.Series

// "2026  •  Action  •  1h 45  •  ★ 7.4"
private fun metaLine(info: MediaInfo?, fallbackRating: String?): String {
    val rating = ratingText(info?.rating ?: fallbackRating)

    return listOfNotNull(
        info?.year,
        info?.genre?.take(48),
        info?.duration?.takeIf { it.isNotBlank() },
        rating?.let { "\u2605 $it" },
    ).joinToString("  \u2022  ")
}

// The picture of the film or series, dimmed, behind the text.
@Composable
private fun Backdrop(url: String?, title: String) {
    Box(modifier = Modifier.fillMaxSize()) {
        PosterImage(url, title, Modifier.fillMaxSize())

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(listOf(Color(0xF20A0A12), Color(0xD90A0A12), Color(0x990A0A12)))
                ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xFF0A0A12)))),
        )
    }
}

@Composable
private fun HeartIcon(on: Boolean) {
    Icon(
        if (on) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
        contentDescription = null,
        tint = if (on) Accent else Color.White,
        modifier = Modifier.size(22.dp),
    )
}

@Composable
fun MovieDetailsScreen(viewModel: MainViewModel, movie: Movie) {
    val state by viewModel.movieInfo.collectAsStateWithLifecycle()
    val favorites by viewModel.favMovies.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val playFocus = remember { FocusRequester() }
    val info = (state as? Loadable.Ready)?.value
    val favorite = favorites.any { it.id == movie.id }
    val saved = progress.firstOrNull { it.kind == MediaKind.MOVIE && it.id == movie.id }
    val canResume = saved != null && saved.inProgress
    val castNames = remember(info?.cast) {
        info?.cast
            ?.split(',', ';', '|')
            ?.map { it.trim() }
            ?.filter { it.length > 1 }
            ?.take(14)
            .orEmpty()
    }

    BackHandler { viewModel.back() }

    LaunchedEffect(Unit) { runCatching { playFocus.requestFocus() } }

    var askResume by remember { mutableStateOf(false) }

    if (askResume && saved != null) {
        ResumeDialog(
            title = displayName(movie.name),
            positionMs = saved.position,
            onResume = {
                askResume = false
                viewModel.playMovie(movie, resume = true)
            },
            onRestart = {
                askResume = false
                viewModel.playMovie(movie, resume = false)
            },
            onDismiss = { askResume = false },
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Backdrop(info?.backdrop ?: movie.poster, movie.name)

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
        Row(
            modifier = Modifier
                .fillParentMaxHeight(0.86f)
                .padding(horizontal = 56.dp, vertical = 36.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PosterImage(
                info?.poster ?: movie.poster,
                movie.name,
                Modifier
                    .width(210.dp)
                    .aspectRatio(2f / 3f)
                    .clip(RoundedCornerShape(16.dp)),
            )

            Spacer(Modifier.width(32.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    displayName(movie.name),
                    color = Color.White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                val meta = metaLine(info, movie.rating)

                if (meta.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(meta, color = Color(0xFFD0D0E0), fontSize = 15.sp, maxLines = 1)
                }

                Spacer(Modifier.height(10.dp))

                val plot = info?.plot

                Text(
                    when {
                        plot != null -> plot
                        state is Loadable.Loading -> stringResource(R.string.common_loading)
                        else -> stringResource(R.string.details_no_plot)
                    },
                    color = Color(0xFFE0E0EC),
                    fontSize = 15.sp,
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                )

                Spacer(Modifier.height(18.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionButton(
                        text = stringResource(R.string.details_play),
                        onClick = {
                            // Already started: ask whether to resume or start over.
                            if (canResume) askResume = true else viewModel.playMovie(movie, resume = false)
                        },
                        primary = true,
                        focusRequester = playFocus,
                        icon = {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp),
                            )
                        },
                    )

                    ActionButton(
                        text = stringResource(
                            if (favorite) R.string.details_favorite_remove else R.string.details_favorite_add
                        ),
                        onClick = { viewModel.toggleFavorite(movie) },
                        icon = { HeartIcon(favorite) },
                    )
                }

                // How far you got.
                if (canResume && saved != null) {
                    Spacer(Modifier.height(12.dp))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ProgressLine(saved.fraction, Modifier.width(220.dp))

                        Spacer(Modifier.width(12.dp))

                        Text(
                            formatDuration(saved.position) + " / " + formatDuration(saved.duration),
                            color = Muted,
                            fontSize = 13.sp,
                        )
                    }
                }

                val director = info?.director

                if (director != null) {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        stringResource(R.string.details_director, director),
                        color = Muted,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                // Each actor can be selected: it lists their movies in your catalogue.
                if (castNames.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))

                    Text(
                        stringResource(R.string.details_cast_title),
                        color = Muted,
                        fontSize = 14.sp,
                    )

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(vertical = 4.dp),
                    ) {
                        items(castNames) { name ->
                            Pill(
                                text = name,
                                selected = false,
                                onClick = { viewModel.openActor(name) },
                            )
                        }
                    }
                }
            }
        }
            }

            item { SimilarMoviesSection(viewModel) }
        }
    }
}

@Composable
fun SeriesDetailsScreen(viewModel: MainViewModel, series: Series) {
    val state by viewModel.seriesInfo.collectAsStateWithLifecycle()
    val favorites by viewModel.favSeries.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val favorite = favorites.any { it.id == series.id }
    val loaded = (state as? Loadable.Ready)?.value
    val info = loaded?.info
    val seasons = loaded?.seasons.orEmpty()
    val seasonNumbers = remember(seasons) { seasons.keys.toList().sorted() }

    // The season to show first: the one watched last, else the first.
    val lastSeason = remember(progress, series.id) {
        progress.firstOrNull { it.seriesId == series.id }?.season
    }
    var chosenSeason by rememberSaveable(series.id) { mutableStateOf(-1) }
    val season = when {
        chosenSeason in seasonNumbers -> chosenSeason
        lastSeason != null && lastSeason in seasonNumbers -> lastSeason
        else -> seasonNumbers.firstOrNull() ?: 0
    }
    val episodes = seasons[season].orEmpty()
    val firstEpisodeFocus = remember { FocusRequester() }
    var pending by remember { mutableStateOf<Episode?>(null) }

    BackHandler { viewModel.back() }

    LaunchedEffect(episodes.firstOrNull()?.id) {
        if (episodes.isNotEmpty()) runCatching { firstEpisodeFocus.requestFocus() }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Backdrop(info?.backdrop ?: series.poster, series.name)

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
        Row(
            modifier = Modifier
                .fillParentMaxHeight(0.86f)
                .padding(horizontal = 56.dp, vertical = 32.dp),
        ) {
            Column(modifier = Modifier.width(290.dp)) {
                PosterImage(
                    info?.poster ?: series.poster,
                    series.name,
                    Modifier
                        .width(130.dp)
                        .aspectRatio(2f / 3f)
                        .clip(RoundedCornerShape(14.dp)),
                )

                Spacer(Modifier.height(12.dp))

                Text(
                    displayName(series.name),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                Spacer(Modifier.height(10.dp))

                // Right under the title, so it is always on screen.
                ActionButton(
                    text = stringResource(
                        if (favorite) R.string.details_favorite_remove else R.string.details_favorite_add
                    ),
                    onClick = { viewModel.toggleFavorite(series) },
                    icon = { HeartIcon(favorite) },
                )

                val meta = metaLine(info, series.rating)

                if (meta.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text(meta, color = Color(0xFFD0D0E0), fontSize = 13.sp, maxLines = 2)
                }

                val plot = info?.plot

                if (plot != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        plot,
                        color = Color(0xFFE0E0EC),
                        fontSize = 13.sp,
                        maxLines = 4,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(Modifier.width(32.dp))

            Column(modifier = Modifier.weight(1f)) {
                when (val current = state) {
                    is Loadable.Loading -> MessageBlock(stringResource(R.string.common_loading), "")
                    is Loadable.Failed -> MessageBlock(
                        title = stringResource(R.string.error_load_title),
                        hint = current.error.errorText(),
                        actionLabel = stringResource(R.string.common_retry),
                        onAction = { viewModel.openSeriesAgain(series) },
                    )
                    is Loadable.Ready -> {
                        if (seasonNumbers.isEmpty()) {
                            MessageBlock(stringResource(R.string.details_no_episodes), "")
                        } else {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                contentPadding = PaddingValues(bottom = 12.dp),
                            ) {
                                items(seasonNumbers) { number ->
                                    Pill(
                                        text = stringResource(R.string.details_season, number),
                                        selected = number == season,
                                        onClick = { chosenSeason = number },
                                    )
                                }
                            }

                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(bottom = 40.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(episodes) { episode ->
                                    val saved = progress.firstOrNull {
                                        it.kind == MediaKind.EPISODE && it.id == episode.id
                                    }

                                    EpisodeRow(
                                        episode = episode,
                                        fraction = saved?.fraction,
                                        finished = saved?.finished == true,
                                        focusRequester = if (episode.id == episodes.first().id) firstEpisodeFocus else null,
                                        onClick = {
                                            // Already started: ask whether to resume or start over.
                                            if (saved != null && saved.inProgress) {
                                                pending = episode
                                            } else {
                                                viewModel.playEpisode(series, episode, resume = false)
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
            }

            item { SimilarSeriesSection(viewModel) }
        }
    }

    pending?.let { episode ->
        val saved = progress.firstOrNull { it.kind == MediaKind.EPISODE && it.id == episode.id }

        ResumeDialog(
            title = episode.title,
            positionMs = saved?.position ?: 0L,
            onResume = {
                pending = null
                viewModel.playEpisode(series, episode, resume = true)
            },
            onRestart = {
                pending = null
                viewModel.playEpisode(series, episode, resume = false)
            },
            onDismiss = { pending = null },
        )
    }
}

@Composable
private fun EpisodeRow(
    episode: Episode,
    fraction: Float?,
    finished: Boolean,
    focusRequester: FocusRequester?,
    onClick: () -> Unit,
) {
    FocusCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        focusedScale = 1.02f,
        focusRequester = focusRequester,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (finished) Accent else Color(0x33FFFFFF)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (finished) "\u2713" else episode.number.toString(),
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    episode.title,
                    color = TextMain,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                val line = listOfNotNull(
                    episode.duration?.takeIf { it.isNotBlank() },
                    episode.plot?.take(110),
                ).joinToString("  \u2022  ")

                if (line.isNotEmpty()) {
                    Text(
                        line,
                        color = Muted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (fraction != null && !finished && fraction > 0.02f) {
                    Spacer(Modifier.height(6.dp))
                    ProgressLine(fraction, Modifier.fillMaxWidth(0.5f))
                }
            }
        }
    }
}
