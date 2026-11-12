package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab

@Composable
fun MainScreen(viewModel: MainViewModel) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()

    // Back goes to the home page first, then leaves the app.
    BackHandler(enabled = tab != Tab.HOME) { viewModel.selectTab(Tab.HOME) }

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(tab) { viewModel.selectTab(it) }

        when (tab) {
            Tab.HOME -> HomeTab(viewModel)
            Tab.LIVE -> LiveTab(viewModel)
            Tab.MOVIES -> MoviesTab(viewModel)
            Tab.SERIES -> SeriesTab(viewModel)
            Tab.FAVORITES -> FavoritesTab(viewModel)
            Tab.SEARCH -> SearchTab(viewModel)
            Tab.SETTINGS -> SettingsTab(viewModel)
        }
    }
}

@Composable
private fun labelOf(tab: Tab): String =
    stringResource(
        when (tab) {
            Tab.HOME -> R.string.nav_home
            Tab.LIVE -> R.string.nav_live
            Tab.MOVIES -> R.string.nav_movies
            Tab.SERIES -> R.string.nav_series
            Tab.FAVORITES -> R.string.nav_favorites
            Tab.SEARCH -> R.string.nav_search
            Tab.SETTINGS -> R.string.nav_settings
        }
    )

@Composable
private fun TopBar(current: Tab, onSelect: (Tab) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrandMark(40.dp)
        Spacer(Modifier.width(26.dp))

        for (tab in Tab.values()) {
            Pill(labelOf(tab), tab == current, onClick = { onSelect(tab) })
            Spacer(Modifier.width(6.dp))
        }
    }
}
