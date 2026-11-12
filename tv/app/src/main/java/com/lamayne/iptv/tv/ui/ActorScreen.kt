package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.Loadable

// The movies of your catalogue with a given actor.
@Composable
fun ActorScreen(viewModel: MainViewModel, name: String) {
    val state by viewModel.actorMovies.collectAsStateWithLifecycle()
    val favorites by viewModel.favMovies.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val firstFocus = remember { FocusRequester() }
    val movies = (state as? Loadable.Ready)?.value.orEmpty()

    BackHandler { viewModel.back() }

    FocusFirstWhen(movies.firstOrNull()?.id, movies.isNotEmpty(), firstFocus)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 56.dp, vertical = 32.dp),
    ) {
        Text(
            stringResource(R.string.actor_title, name),
            color = Color.White,
            fontSize = 30.sp,
            fontWeight = FontWeight.Bold,
        )

        Spacer(Modifier.height(4.dp))

        Text(stringResource(R.string.actor_note), color = Muted, fontSize = 13.sp)

        Spacer(Modifier.height(16.dp))

        when (val current = state) {
            is Loadable.Loading -> MessageBlock(
                stringResource(R.string.actor_loading),
                stringResource(R.string.actor_loading_hint),
            )
            is Loadable.Failed -> MessageBlock(
                title = stringResource(R.string.actor_unavailable),
                hint = current.error.errorText(),
            )
            is Loadable.Ready -> {
                if (current.value.isEmpty()) {
                    MessageBlock(
                        stringResource(R.string.actor_none),
                        stringResource(R.string.actor_none_hint),
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(142.dp),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        itemsIndexed(current.value) { index, movie ->
                            PosterCard(
                                title = displayName(movie.name),
                                image = movie.poster,
                                modifier = Modifier.fillMaxWidth(),
                                favorite = favoriteIds.contains(movie.id),
                                rating = ratingText(movie.rating),
                                focusRequester = if (index == 0) firstFocus else null,
                                onClick = { viewModel.openMovie(movie) },
                            )
                        }
                    }
                }
            }
        }
    }
}
