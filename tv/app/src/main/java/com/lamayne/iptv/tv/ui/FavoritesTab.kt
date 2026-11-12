package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R

@Composable
fun FavoritesTab(viewModel: MainViewModel) {
    val channels by viewModel.favChannels.collectAsStateWithLifecycle()
    val movies by viewModel.favMovies.collectAsStateWithLifecycle()
    val series by viewModel.favSeries.collectAsStateWithLifecycle()

    if (channels.isEmpty() && movies.isEmpty() && series.isEmpty()) {
        FullScreenMessage(
            title = stringResource(R.string.fav_empty_title),
            hint = stringResource(R.string.fav_empty_hint),
        )

        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 8.dp, bottom = 48.dp),
    ) {
        item {
            ContentRow(stringResource(R.string.fav_channels), channels, Modifier.padding(bottom = 18.dp)) { channel ->
                ChannelTile(
                    channel = channel,
                    modifier = Modifier.width(190.dp),
                    favorite = true,
                    onClick = { viewModel.playLive(channel, channels) },
                )
            }
        }

        item {
            ContentRow(stringResource(R.string.fav_movies), movies, Modifier.padding(bottom = 18.dp)) { movie ->
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
