package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.MediaKind

@Composable
fun MoviesTab(viewModel: MainViewModel) {
    val hidden by viewModel.hiddenMovies.collectAsStateWithLifecycle()
    val favorites by viewModel.favMovies.collectAsStateWithLifecycle()
    val results by viewModel.searchMovies.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val progressById = remember(progress) {
        progress.filter { it.kind == MediaKind.MOVIE && it.inProgress }.associateBy { it.id }
    }

    BrowsePage(
        viewModel = viewModel,
        kind = MediaKind.MOVIE,
        controller = viewModel.movies,
        hidden = hidden,
        favorites = favorites,
        searchResults = results,
        idOf = { it.id },
        categoryIdOf = { it.categoryId },
        panelTitle = R.string.movies_categories,
        countFormat = R.string.movies_count,
        searchHint = R.string.search_hint_movies,
        onSelectCategory = { viewModel.selectMovieCategory(it) },
        onRetry = { viewModel.retry(Tab.MOVIES) },
    ) { list, ctx ->
        if (ctx.searching) {
            // A search lists the category of each result.
            val listState = rememberLazyListState(initialFirstVisibleItemIndex = ctx.startIndex)

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(list) { index, movie ->
                    SearchRow(
                        title = displayName(movie.name),
                        image = movie.poster,
                        category = ctx.categoryOf(movie),
                        rating = ratingText(movie.rating),
                        favorite = favoriteIds.contains(movie.id),
                        focusRequester = if (index == ctx.startIndex) ctx.firstFocus else null,
                        onLongClick = { viewModel.toggleFavorite(movie) },
                        onClick = { viewModel.openMovie(movie) },
                    )
                }
            }
        } else {
            val gridState = rememberLazyGridState(initialFirstVisibleItemIndex = ctx.startIndex)

            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(90.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                itemsIndexed(list) { index, movie ->
                    PosterCard(
                        title = displayName(movie.name),
                        image = movie.poster,
                        modifier = Modifier.fillMaxWidth(),
                        favorite = favoriteIds.contains(movie.id),
                        rating = ratingText(movie.rating),
                        progress = progressById[movie.id]?.fraction,
                        focusRequester = if (index == ctx.startIndex) ctx.firstFocus else null,
                        onLongClick = { viewModel.toggleFavorite(movie) },
                        onClick = { viewModel.openMovie(movie) },
                    )
                }
            }
        }
    }
}

@Composable
fun SeriesTab(viewModel: MainViewModel) {
    val hidden by viewModel.hiddenSeries.collectAsStateWithLifecycle()
    val favorites by viewModel.favSeries.collectAsStateWithLifecycle()
    val results by viewModel.searchSeries.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }

    BrowsePage(
        viewModel = viewModel,
        kind = MediaKind.SERIES,
        controller = viewModel.series,
        hidden = hidden,
        favorites = favorites,
        searchResults = results,
        idOf = { it.id },
        categoryIdOf = { it.categoryId },
        panelTitle = R.string.series_categories,
        countFormat = R.string.series_count,
        searchHint = R.string.search_hint_series,
        onSelectCategory = { viewModel.selectSeriesCategory(it) },
        onRetry = { viewModel.retry(Tab.SERIES) },
    ) { list, ctx ->
        if (ctx.searching) {
            val listState = rememberLazyListState(initialFirstVisibleItemIndex = ctx.startIndex)

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                itemsIndexed(list) { index, item ->
                    SearchRow(
                        title = displayName(item.name),
                        image = item.poster,
                        category = ctx.categoryOf(item),
                        rating = ratingText(item.rating),
                        favorite = favoriteIds.contains(item.id),
                        focusRequester = if (index == ctx.startIndex) ctx.firstFocus else null,
                        onLongClick = { viewModel.toggleFavorite(item) },
                        onClick = { viewModel.openSeries(item) },
                    )
                }
            }
        } else {
            val gridState = rememberLazyGridState(initialFirstVisibleItemIndex = ctx.startIndex)

            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(90.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                itemsIndexed(list) { index, item ->
                    PosterCard(
                        title = displayName(item.name),
                        image = item.poster,
                        modifier = Modifier.fillMaxWidth(),
                        favorite = favoriteIds.contains(item.id),
                        rating = ratingText(item.rating),
                        focusRequester = if (index == ctx.startIndex) ctx.firstFocus else null,
                        onLongClick = { viewModel.toggleFavorite(item) },
                        onClick = { viewModel.openSeries(item) },
                    )
                }
            }
        }
    }
}
