package com.lamayne.iptv.tv.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

val Background = Color(0xFF0B0B12)
val Accent = Color(0xFF8B5CF6)
val Muted = Color(0xFFA1A1AA)
val ErrorText = Color(0xFFFCA5A5)

@Composable
fun LamayneTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            background = Background,
            surface = Color(0xFF16161F),
        ),
        content = content,
    )
}
