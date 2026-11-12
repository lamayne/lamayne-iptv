package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

val Bg = Color(0xFF0A0A12)
val Panel = Color(0xFF13131F)
val CardBg = Color(0xFF191929)
val CardFocused = Color(0xFF2B2B55)
val Accent = Color(0xFF8B5CF6)
val AccentBright = Color(0xFFA78BFA)
val AccentDeep = Color(0xFF2A1F5C)
val TextMain = Color(0xFFF4F4F8)
val Muted = Color(0xFF9A9AB2)
val Danger = Color(0xFFFCA5A5)
val LiveRed = Color(0xFFEF4444)
val LogoBg = Color(0xFF0E0E19)

// The screens are drawn for a 960 x 540 dp screen. TVs report very different sizes
// (the same 1080p picture can be 640 x 360 dp or 960 x 540 dp depending on the
// device): everything is scaled so that the layout always fits the same way.
@Composable
fun LamayneTheme(content: @Composable () -> Unit) {
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val scale = minOf(
        configuration.screenWidthDp / 960f,
        configuration.screenHeightDp / 540f,
    ).coerceIn(0.5f, 3f)
    val scaled = Density(density.density * scale, density.fontScale)

    CompositionLocalProvider(LocalDensity provides scaled) {
        MaterialTheme(
            colorScheme = darkColorScheme(
                primary = Accent,
                background = Bg,
                surface = Panel,
                onSurface = TextMain,
                onBackground = TextMain,
            ),
            content = content,
        )
    }
}

// Dark background with a soft violet glow in the top-left corner.
@Composable
fun AppBackground() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0x558B5CF6), Color.Transparent),
                    center = Offset(0f, 0f),
                    radius = 1500f,
                )
            ),
    )
}
