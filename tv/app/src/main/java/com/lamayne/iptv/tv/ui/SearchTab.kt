package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.MediaKind

@Composable
fun SearchTab(viewModel: MainViewModel) {
    val query by viewModel.searchQuery.collectAsStateWithLifecycle()
    val channels by viewModel.searchChannels.collectAsStateWithLifecycle()
    val movies by viewModel.searchMovies.collectAsStateWithLifecycle()
    val series by viewModel.searchSeries.collectAsStateWithLifecycle()
    val loading by viewModel.searchLoading.collectAsStateWithLifecycle()
    val favorites by viewModel.favChannels.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    var scope by rememberSaveable { mutableStateOf(0) }

    val showChannels = scope == 0 || scope == 1
    val showMovies = scope == 0 || scope == 2
    val showSeries = scope == 0 || scope == 3
    val tooShort = query.trim().length < 2
    val nothing = (!showChannels || channels.isEmpty()) &&
        (!showMovies || movies.isEmpty()) &&
        (!showSeries || series.isEmpty())

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 0.dp, end = 0.dp, top = 4.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { viewModel.setSearchQuery(it) },
                label = { Text(stringResource(R.string.search_hint)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 48.dp),
            )
        }

        item {
            Row(
                modifier = Modifier.padding(horizontal = 48.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Pill(stringResource(R.string.search_all), scope == 0, { scope = 0 })
                Pill(stringResource(R.string.nav_live), scope == 1, { scope = 1 })
                Pill(stringResource(R.string.nav_movies), scope == 2, { scope = 2 })
                Pill(stringResource(R.string.nav_series), scope == 3, { scope = 3 })
            }
        }

        if (loading.isNotEmpty()) {
            item {
                val liveLabel = stringResource(R.string.nav_live)
                val moviesLabel = stringResource(R.string.nav_movies)
                val seriesLabel = stringResource(R.string.nav_series)
                val names = loading.joinToString(", ") { kind ->
                    when (kind) {
                        MediaKind.LIVE -> liveLabel
                        MediaKind.MOVIE -> moviesLabel
                        else -> seriesLabel
                    }
                }

                Text(
                    stringResource(R.string.search_loading, names),
                    color = Muted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(horizontal = 52.dp),
                )
            }
        }

        if (tooShort) {
            item {
                MessageBlock(
                    title = stringResource(R.string.nav_search),
                    hint = stringResource(R.string.search_type_more),
                )
            }
        } else if (nothing && loading.isEmpty()) {
            item {
                MessageBlock(
                    title = stringResource(R.string.search_none),
                    hint = stringResource(R.string.search_none_hint),
                )
            }
        } else {
            if (showChannels && channels.isNotEmpty()) {
                item {
                    SectionTitle(
                        stringResource(R.string.fav_channels),
                        Modifier.padding(start = 48.dp, top = 6.dp),
                    )
                }

                items(channels) { channel ->
                    ChannelRow(
                        channel = channel,
                        epg = null,
                        favorite = favoriteIds.contains(channel.id),
                        modifier = Modifier.padding(horizontal = 48.dp),
                        onClick = { viewModel.playLive(channel, channels) },
                    )
                }
            }

            if (showMovies) {
                item {
                    ContentRow(stringResource(R.string.fav_movies), movies) { movie ->
                        PosterCard(
                            title = displayName(movie.name),
                            image = movie.poster,
                            modifier = Modifier.width(150.dp),
                            rating = ratingText(movie.rating),
                            onClick = { viewModel.openMovie(movie) },
                        )
                    }
                }
            }

            if (showSeries) {
                item {
                    ContentRow(stringResource(R.string.fav_series), series) { item ->
                        PosterCard(
                            title = displayName(item.name),
                            image = item.poster,
                            modifier = Modifier.width(150.dp),
                            rating = ratingText(item.rating),
                            onClick = { viewModel.openSeries(item) },
                        )
                    }
                }
            }
        }
    }
}
