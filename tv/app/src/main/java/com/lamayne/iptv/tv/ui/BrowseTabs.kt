package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.MediaKind
import com.lamayne.iptv.tv.data.WatchProgress

@Composable
fun MoviesTab(viewModel: MainViewModel) {
    val categories by viewModel.movies.categories.collectAsStateWithLifecycle()
    val selected by viewModel.movies.selected.collectAsStateWithLifecycle()
    val movies by viewModel.movies.items.collectAsStateWithLifecycle()
    val loading by viewModel.movies.loading.collectAsStateWithLifecycle()
    val error by viewModel.movies.error.collectAsStateWithLifecycle()
    val hidden by viewModel.hiddenMovies.collectAsStateWithLifecycle()
    val favorites by viewModel.favMovies.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val progressById = remember(progress) {
        progress.filter { it.kind == MediaKind.MOVIE && it.inProgress }.associateBy { it.id }
    }
    val firstFocus = remember { FocusRequester() }

    FocusFirstWhen(movies.firstOrNull()?.id, movies.isNotEmpty(), firstFocus)

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 48.dp, end = 48.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        CategoryPanel(
            title = stringResource(R.string.movies_categories),
            categories = categories,
            hidden = hidden,
            selectedId = selected?.id,
            onSelect = { viewModel.selectMovieCategory(it) },
            modifier = Modifier.width(250.dp),
        )

        Column(modifier = Modifier.weight(1f)) {
            ListHeader(
                title = selected?.let { displayName(it.name) } ?: stringResource(R.string.nav_movies),
                count = if (movies.isEmpty()) "" else stringResource(R.string.movies_count, movies.size),
            )

            val failure = error

            when {
                failure != null -> MessageBlock(
                    title = stringResource(R.string.error_load_title),
                    hint = failure.errorText(),
                    actionLabel = stringResource(R.string.common_retry),
                    onAction = { viewModel.retry(Tab.MOVIES) },
                )
                loading && movies.isEmpty() -> MessageBlock(stringResource(R.string.common_loading), "")
                movies.isEmpty() -> MessageBlock(stringResource(R.string.browse_empty), "")
                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(142.dp),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    itemsIndexed(movies) { index, movie ->
                        PosterCard(
                            title = displayName(movie.name),
                            image = movie.poster,
                            modifier = Modifier.fillMaxWidth(),
                            favorite = favoriteIds.contains(movie.id),
                            rating = ratingText(movie.rating),
                            progress = progressById[movie.id]?.fraction,
                            focusRequester = if (index == 0) firstFocus else null,
                            onClick = { viewModel.openMovie(movie) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SeriesTab(viewModel: MainViewModel) {
    val categories by viewModel.series.categories.collectAsStateWithLifecycle()
    val selected by viewModel.series.selected.collectAsStateWithLifecycle()
    val series by viewModel.series.items.collectAsStateWithLifecycle()
    val loading by viewModel.series.loading.collectAsStateWithLifecycle()
    val error by viewModel.series.error.collectAsStateWithLifecycle()
    val hidden by viewModel.hiddenSeries.collectAsStateWithLifecycle()
    val favorites by viewModel.favSeries.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val firstFocus = remember { FocusRequester() }

    FocusFirstWhen(series.firstOrNull()?.id, series.isNotEmpty(), firstFocus)

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 48.dp, end = 48.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        CategoryPanel(
            title = stringResource(R.string.series_categories),
            categories = categories,
            hidden = hidden,
            selectedId = selected?.id,
            onSelect = { viewModel.selectSeriesCategory(it) },
            modifier = Modifier.width(250.dp),
        )

        Column(modifier = Modifier.weight(1f)) {
            ListHeader(
                title = selected?.let { displayName(it.name) } ?: stringResource(R.string.nav_series),
                count = if (series.isEmpty()) "" else stringResource(R.string.series_count, series.size),
            )

            val failure = error

            when {
                failure != null -> MessageBlock(
                    title = stringResource(R.string.error_load_title),
                    hint = failure.errorText(),
                    actionLabel = stringResource(R.string.common_retry),
                    onAction = { viewModel.retry(Tab.SERIES) },
                )
                loading && series.isEmpty() -> MessageBlock(stringResource(R.string.common_loading), "")
                series.isEmpty() -> MessageBlock(stringResource(R.string.browse_empty), "")
                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(142.dp),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    itemsIndexed(series) { index, item ->
                        PosterCard(
                            title = displayName(item.name),
                            image = item.poster,
                            modifier = Modifier.fillMaxWidth(),
                            favorite = favoriteIds.contains(item.id),
                            rating = ratingText(item.rating),
                            focusRequester = if (index == 0) firstFocus else null,
                            onClick = { viewModel.openSeries(item) },
                        )
                    }
                }
            }
        }
    }
}
