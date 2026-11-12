package com.lamayne.iptv.tv.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.MediaKind
import java.net.URI

private fun Context.findActivity(): Activity? {
    var current: Context? = this

    while (current is ContextWrapper) {
        if (current is Activity) return current

        current = current.baseContext
    }

    return null
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Panel)
            .padding(22.dp),
    ) {
        Text(
            title.uppercase(),
            color = Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
        )

        Spacer(Modifier.height(12.dp))

        content()
    }
}

@Composable
fun SettingsTab(viewModel: MainViewModel) {
    val context = LocalContext.current
    val credentials by viewModel.credentials.collectAsStateWithLifecycle()
    var language by remember { mutableStateOf(viewModel.settings.language) }
    var refreshMessage by remember { mutableStateOf<String?>(null) }
    var browserMessage by remember { mutableStateOf<String?>(null) }
    val refreshing = stringResource(R.string.settings_refreshed)
    val noBrowser = stringResource(R.string.settings_no_browser)
    val qr = remember { Qr.make(SUPPORT_URL) }
    var message by remember { mutableStateOf<String?>(null) }
    val cleared = stringResource(R.string.settings_cleared)

    val version = remember {
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp),
        contentPadding = PaddingValues(top = 4.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Group(stringResource(R.string.settings_language)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val options = listOf(
                        "system" to stringResource(R.string.settings_language_auto),
                        "en" to "English",
                        "fr" to "Fran\u00e7ais",
                        "es" to "Espa\u00f1ol",
                    )

                    for ((code, label) in options) {
                        Pill(
                            text = label,
                            selected = language == code,
                            onClick = {
                                if (language != code) {
                                    language = code
                                    viewModel.setLanguage(code)
                                    // The screens are rebuilt in the new language.
                                    context.findActivity()?.recreate()
                                }
                            },
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))

                Text(stringResource(R.string.settings_language_hint), color = Muted, fontSize = 14.sp)
            }
        }

        item {
            Group(stringResource(R.string.settings_account)) {
                val account = credentials
                val host = account?.let {
                    try {
                        URI(it.server).host ?: it.server
                    } catch (e: Exception) {
                        it.server
                    }
                }

                Text(
                    stringResource(R.string.settings_account_as, account?.user.orEmpty(), host.orEmpty()),
                    color = TextMain,
                    fontSize = 17.sp,
                )

                Spacer(Modifier.height(14.dp))

                ActionButton(
                    text = stringResource(R.string.settings_sign_out),
                    onClick = { viewModel.logout() },
                )
            }
        }

        item {
            Group(stringResource(R.string.settings_visible)) {
                Text(
                    stringResource(R.string.settings_visible_hint),
                    color = Muted,
                    fontSize = 15.sp,
                )

                Spacer(Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionButton(
                        text = stringResource(R.string.live_categories),
                        onClick = { viewModel.openManageCategories(MediaKind.LIVE) },
                    )
                    ActionButton(
                        text = stringResource(R.string.movies_categories),
                        onClick = { viewModel.openManageCategories(MediaKind.MOVIE) },
                    )
                    ActionButton(
                        text = stringResource(R.string.series_categories),
                        onClick = { viewModel.openManageCategories(MediaKind.SERIES) },
                    )
                }
            }
        }

        item {
            Group(stringResource(R.string.settings_refresh)) {
                Text(stringResource(R.string.settings_refresh_hint), color = Muted, fontSize = 15.sp)

                Spacer(Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionButton(
                        text = stringResource(R.string.settings_refresh_live),
                        onClick = {
                            viewModel.refresh(MediaKind.LIVE)
                            refreshMessage = refreshing
                        },
                    )
                    ActionButton(
                        text = stringResource(R.string.settings_refresh_movies),
                        onClick = {
                            viewModel.refresh(MediaKind.MOVIE)
                            refreshMessage = refreshing
                        },
                    )
                    ActionButton(
                        text = stringResource(R.string.settings_refresh_series),
                        onClick = {
                            viewModel.refresh(MediaKind.SERIES)
                            refreshMessage = refreshing
                        },
                    )
                }

                Spacer(Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionButton(
                        text = stringResource(R.string.settings_refresh_guide),
                        onClick = {
                            viewModel.refreshGuide()
                            refreshMessage = refreshing
                        },
                    )
                    ActionButton(
                        text = stringResource(R.string.settings_refresh_all),
                        primary = true,
                        onClick = {
                            viewModel.refreshAll()
                            refreshMessage = refreshing
                        },
                    )
                }

                val note = refreshMessage

                if (note != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(note, color = AccentBright, fontSize = 15.sp)
                }
            }
        }

        item {
            Group(stringResource(R.string.settings_data)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ActionButton(
                        text = stringResource(R.string.settings_clear_history),
                        onClick = {
                            viewModel.clearProgress()
                            message = cleared
                        },
                    )
                }

                val note = message

                if (note != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(note, color = AccentBright, fontSize = 15.sp)
                }
            }
        }

        item {
            Group(stringResource(R.string.settings_about)) {
                Text(
                    "LAMAYNE IPTV  " + stringResource(R.string.settings_version, version),
                    color = TextMain,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                )

                Spacer(Modifier.height(8.dp))

                Text(stringResource(R.string.settings_disclaimer), color = Muted, fontSize = 15.sp)

                Spacer(Modifier.height(8.dp))

                Text("github.com/lamayne/lamayne-iptv", color = AccentBright, fontSize = 15.sp)
            }
        }

        item {
            Group(stringResource(R.string.settings_support)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (qr != null) {
                        Image(
                            bitmap = qr,
                            contentDescription = null,
                            modifier = Modifier
                                .size(150.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(Color.White)
                                .padding(8.dp),
                        )

                        Spacer(Modifier.width(22.dp))
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.settings_support_text), color = TextMain, fontSize = 16.sp)

                        Spacer(Modifier.height(6.dp))

                        Text(SUPPORT_URL, color = AccentBright, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)

                        Spacer(Modifier.height(4.dp))

                        Text(stringResource(R.string.settings_scan), color = Muted, fontSize = 13.sp)

                        Spacer(Modifier.height(12.dp))

                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            ActionButton(
                                text = stringResource(R.string.settings_support_open),
                                primary = true,
                                onClick = {
                                    browserMessage = if (openLink(context, SUPPORT_URL)) null else noBrowser
                                },
                            )
                            ActionButton(
                                text = stringResource(R.string.settings_news_open),
                                onClick = {
                                    browserMessage = if (openLink(context, NEWS_URL)) null else noBrowser
                                },
                            )
                        }

                        val warning = browserMessage

                        if (warning != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(warning, color = Danger, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}

private const val SUPPORT_URL = "https://buymeacoffee.com/lamayne"
private const val NEWS_URL = "https://linktr.ee/lamayne"

// Most TVs have no browser: false when nothing could open the link.
private fun openLink(context: Context, url: String): Boolean =
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (e: Exception) {
        false
    }
