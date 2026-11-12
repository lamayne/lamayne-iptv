package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.ActorProgress
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.StepState
import com.lamayne.iptv.tv.data.Loadable
import kotlinx.coroutines.delay

// The movies of your catalogue with a given actor.
@Composable
fun ActorScreen(viewModel: MainViewModel, name: String) {
    val state by viewModel.actorMovies.collectAsStateWithLifecycle()
    val progress by viewModel.actorProgress.collectAsStateWithLifecycle()
    val favorites by viewModel.favMovies.collectAsStateWithLifecycle()
    val favoriteIds = remember(favorites) { favorites.map { it.id }.toSet() }
    val firstFocus = remember { FocusRequester() }
    val result = (state as? Loadable.Ready)?.value
    val movies = result?.movies.orEmpty()

    BackHandler { viewModel.back() }

    FocusFirstWhen(movies.firstOrNull()?.id, movies.isNotEmpty(), firstFocus)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 56.dp, vertical = 28.dp),
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
            is Loadable.Loading -> ActorLoading(progress)
            is Loadable.Failed -> MessageBlock(
                title = stringResource(R.string.actor_unavailable),
                hint = current.error.errorText(),
            )
            is Loadable.Ready -> {
                val found = current.value

                when {
                    !found.actorFound -> MessageBlock(
                        stringResource(R.string.actor_not_found),
                        stringResource(R.string.actor_not_found_hint),
                    )
                    found.movies.isEmpty() -> MessageBlock(
                        stringResource(R.string.actor_none),
                        stringResource(R.string.actor_none_hint, found.filmCount),
                    )
                    else -> {
                        Text(
                            stringResource(R.string.actor_summary, found.movies.size, found.filmCount),
                            color = AccentBright,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                        )

                        Spacer(Modifier.height(10.dp))

                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(120.dp),
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 30.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            itemsIndexed(found.movies) { index, movie ->
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
}

// While the lookup runs: a spinner, the time elapsed and the three steps, so it is
// always clear that something is happening (and what).
@Composable
private fun ActorLoading(progress: ActorProgress) {
    var seconds by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            seconds += 1
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.width(170.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator(
                color = Accent,
                trackColor = Color(0x22FFFFFF),
                strokeWidth = 6.dp,
                modifier = Modifier.size(84.dp),
            )

            Spacer(Modifier.height(14.dp))

            Text(
                stringResource(R.string.actor_elapsed, seconds),
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        Spacer(Modifier.width(30.dp))

        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(20.dp))
                .background(Panel)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            StepRow(
                state = progress.lookup,
                running = stringResource(R.string.actor_step_lookup_running),
                done = stringResource(R.string.actor_step_lookup_done, progress.filmCount),
                failed = stringResource(R.string.actor_step_lookup_failed),
            )

            StepRow(
                state = progress.catalogue,
                running = stringResource(R.string.actor_step_catalogue_running),
                done = stringResource(R.string.actor_step_catalogue_done, progress.catalogueSize),
                failed = stringResource(R.string.actor_step_catalogue_failed),
            )

            StepRow(
                state = progress.matching,
                running = stringResource(R.string.actor_step_match_running),
                done = stringResource(R.string.actor_step_match_done),
                failed = stringResource(R.string.actor_step_match_running),
            )

            LinearProgressIndicator(
                color = Accent,
                trackColor = Color(0x22FFFFFF),
                modifier = Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)),
            )

            Text(
                stringResource(if (seconds >= 20) R.string.actor_slow_hint else R.string.actor_loading_hint),
                color = Muted,
                fontSize = 13.sp,
            )
        }
    }
}

// One step: waiting (empty circle), running (spinner), done (tick) or failed (cross).
@Composable
private fun StepRow(state: StepState?, running: String, done: String, failed: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(26.dp), contentAlignment = Alignment.Center) {
            when (state) {
                StepState.RUNNING -> CircularProgressIndicator(
                    color = AccentBright,
                    trackColor = Color.Transparent,
                    strokeWidth = 3.dp,
                    modifier = Modifier.size(22.dp),
                )
                StepState.DONE -> Box(
                    modifier = Modifier.size(24.dp).clip(CircleShape).background(Color(0xFF22C55E)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("\u2713", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                StepState.FAILED -> Box(
                    modifier = Modifier.size(24.dp).clip(CircleShape).background(LiveRed),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("\u2715", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                null -> Box(
                    modifier = Modifier.size(22.dp).clip(CircleShape).background(Color(0x22FFFFFF)),
                )
            }
        }

        Spacer(Modifier.width(14.dp))

        Text(
            when (state) {
                StepState.DONE -> done
                StepState.FAILED -> failed
                else -> running
            },
            color = if (state == null) Muted else TextMain,
            fontSize = 17.sp,
            fontWeight = if (state == StepState.RUNNING) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}
