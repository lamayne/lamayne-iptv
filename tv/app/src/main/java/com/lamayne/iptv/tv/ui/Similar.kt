package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.SimilarReason

@Composable
private fun reasonText(reason: SimilarReason): String =
    stringResource(
        when (reason) {
            SimilarReason.GENRE -> R.string.reason_genre
            SimilarReason.DIRECTOR -> R.string.reason_director
            SimilarReason.CAST -> R.string.reason_cast
            SimilarReason.CATEGORY -> R.string.reason_category
        }
    )

// At the bottom of a movie page: the titles that look like it (same genre, director, cast,
// or at least the same category), like on the Windows app.
@Composable
fun SimilarMoviesSection(viewModel: MainViewModel) {
    val items by viewModel.similarMovies.collectAsStateWithLifecycle()
    val loading by viewModel.similarLoading.collectAsStateWithLifecycle()
    val title = stringResource(R.string.similar_movies)

    Column(modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 48.dp)) {
        if (items.isNotEmpty()) {
            ContentRow(title, items) { entry ->
                PosterCard(
                    title = displayName(entry.movie.name),
                    image = entry.movie.poster,
                    modifier = Modifier.width(100.dp),
                    rating = ratingText(entry.movie.rating),
                    caption = reasonText(entry.reason),
                    onLongClick = { viewModel.toggleFavorite(entry.movie) },
                    onClick = { viewModel.openMovie(entry.movie) },
                )
            }
        } else {
            SimilarEmpty(title, loading)
        }
    }
}

@Composable
fun SimilarSeriesSection(viewModel: MainViewModel) {
    val items by viewModel.similarShows.collectAsStateWithLifecycle()
    val loading by viewModel.similarLoading.collectAsStateWithLifecycle()
    val title = stringResource(R.string.similar_series)

    Column(modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 48.dp)) {
        if (items.isNotEmpty()) {
            ContentRow(title, items) { entry ->
                PosterCard(
                    title = displayName(entry.series.name),
                    image = entry.series.poster,
                    modifier = Modifier.width(100.dp),
                    rating = ratingText(entry.series.rating),
                    caption = reasonText(entry.reason),
                    onLongClick = { viewModel.toggleFavorite(entry.series) },
                    onClick = { viewModel.openSeries(entry.series) },
                )
            }
        } else {
            SimilarEmpty(title, loading)
        }
    }
}

@Composable
private fun SimilarEmpty(title: String, loading: Boolean) {
    SectionTitle(title, Modifier.padding(start = 56.dp))

    Spacer(Modifier.height(8.dp))

    Text(
        stringResource(if (loading) R.string.similar_loading else R.string.similar_none),
        color = Muted,
        fontSize = 14.sp,
        modifier = Modifier.padding(start = 56.dp),
    )
}
