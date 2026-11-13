package com.lamayne.iptv.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.Tab
import com.lamayne.iptv.tv.data.isM3u

@Composable
fun MainScreen(viewModel: MainViewModel) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()

    // Back goes to the home page first, then leaves the app.
    BackHandler(enabled = tab != Tab.HOME) { viewModel.selectTab(Tab.HOME) }

    // A plain M3U playlist has no movies or series.
    val credentials by viewModel.credentials.collectAsStateWithLifecycle()
    val featured by viewModel.featured.collectAsStateWithLifecycle()
    val tabs = Tab.values().filter { !(credentials?.isM3u == true && (it == Tab.MOVIES || it == Tab.SERIES)) }
    val homeEntry = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current

    val goDown: () -> Unit = {
        if (featured.isNotEmpty()) {
            // never crash if the button is not there yet
            runCatching { homeEntry.requestFocus() }
        } else {
            focusManager.moveFocus(FocusDirection.Down)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(
            current = tab,
            tabs = tabs,
            // From the menu, Down goes straight to the Play button of the home page.
            onDown = if (tab == Tab.HOME) goDown else null,
        ) { viewModel.selectTab(it) }

        when (tab) {
            Tab.HOME -> HomeTab(viewModel, homeEntry)
            Tab.LIVE -> LiveTab(viewModel)
            Tab.MOVIES -> MoviesTab(viewModel)
            Tab.SERIES -> SeriesTab(viewModel)
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
            Tab.SETTINGS -> R.string.nav_settings
        }
    )

@Composable
private fun TopBar(current: Tab, tabs: List<Tab>, onDown: (() -> Unit)?, onSelect: (Tab) -> Unit) {
    val clock by produceState(initialValue = currentClock()) {
        while (true) {
            delay(15_000)
            value = currentClock()
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .onPreviewKeyEvent { event ->
                if (onDown != null && event.type == KeyEventType.KeyDown && event.key == Key.DirectionDown) {
                    onDown()
                    true
                } else {
                    false
                }
            }
            .padding(horizontal = 48.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrandMark(44.dp)

        Spacer(Modifier.width(12.dp))

        Column {
            Text("LAMAYNE", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = 4.sp)
            Text("IPTV", color = AccentBright, fontSize = 10.sp, fontWeight = FontWeight.Medium, letterSpacing = 6.sp)
        }

        Spacer(Modifier.width(30.dp))

        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(Color(0x14FFFFFF))
                .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(50))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            for (tab in tabs) {
                TabPill(labelOf(tab), tab == current, onClick = { onSelect(tab) })
            }
        }

        Spacer(Modifier.weight(1f))

        Text(clock, color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Medium)
    }
}

private fun currentClock(): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

// A tab: filled with the accent gradient when selected.
@Composable
private fun TabPill(text: String, selected: Boolean, onClick: () -> Unit) {
    FocusCard(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        container = Color.Transparent,
        focusedContainer = Color(0x33FFFFFF),
        borderColor = Color.White,
        focusedScale = 1.05f,
    ) {
        Box(
            modifier = Modifier
                .background(
                    if (selected) Brush.horizontalGradient(listOf(Accent, Color(0xFF6D4AE0)))
                    else Brush.horizontalGradient(listOf(Color.Transparent, Color.Transparent))
                )
                .padding(horizontal = 20.dp, vertical = 9.dp),
        ) {
            Text(
                text,
                color = if (selected) Color.White else Color(0xFFB4B4C8),
                fontSize = 16.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
            )
        }
    }
}
