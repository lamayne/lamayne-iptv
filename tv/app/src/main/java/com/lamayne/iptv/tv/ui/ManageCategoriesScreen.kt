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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.MediaKind

// Choose which categories are shown (providers send hundreds, most of them useless).
@Composable
fun ManageCategoriesScreen(viewModel: MainViewModel, kind: MediaKind) {
    val categories by viewModel.categoriesOf(kind).collectAsStateWithLifecycle()
    val hidden by viewModel.hiddenOf(kind).collectAsStateWithLifecycle()

    BackHandler { viewModel.back() }

    LaunchedEffect(kind) { viewModel.ensureCategories(kind) }

    val title = stringResource(
        when (kind) {
            MediaKind.MOVIE -> R.string.movies_categories
            MediaKind.SERIES -> R.string.series_categories
            else -> R.string.live_categories
        }
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 28.dp),
    ) {
        Text(title, color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)

        Spacer(Modifier.height(6.dp))

        Text(stringResource(R.string.manage_hint), color = Muted, fontSize = 15.sp)

        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            ActionButton(
                text = stringResource(R.string.manage_show_all),
                onClick = { viewModel.setCategoriesHidden(kind, categories.map { it.id }, hide = false) },
            )
            ActionButton(
                text = stringResource(R.string.manage_hide_all),
                onClick = { viewModel.setCategoriesHidden(kind, categories.map { it.id }, hide = true) },
            )
            Text(
                stringResource(R.string.manage_visible_count, categories.count { it.id !in hidden }, categories.size),
                color = Muted,
                fontSize = 15.sp,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        Spacer(Modifier.height(16.dp))

        if (categories.isEmpty()) {
            MessageBlock(stringResource(R.string.common_loading), "")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(categories) { category ->
                    val visible = category.id !in hidden

                    FocusCard(
                        onClick = { viewModel.setCategoriesHidden(kind, listOf(category.id), hide = visible) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        focusedScale = 1.02f,
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(RoundedCornerShape(7.dp))
                                    .background(if (visible) Accent else Color(0x33FFFFFF)),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (visible) {
                                    Text("\u2713", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                }
                            }

                            Spacer(Modifier.width(16.dp))

                            Text(
                                category.name.trim(),
                                color = if (visible) TextMain else Muted,
                                fontSize = 17.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}
