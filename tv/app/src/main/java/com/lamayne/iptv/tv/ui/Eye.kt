package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import com.lamayne.iptv.tv.R
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// An eye (the password is shown) or a crossed-out eye (it is hidden). Drawn here because the
// extended icon set is not part of the app.
@Composable
fun EyeGlyph(open: Boolean, color: Color = Color(0xFFB8B8CC), glyphSize: Dp = 26.dp) {
    Canvas(modifier = Modifier.size(glyphSize)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = w * 0.09f, cap = StrokeCap.Round)

        // the outline of the eye
        val outline = Path().apply {
            moveTo(w * 0.06f, h * 0.5f)
            quadraticBezierTo(w * 0.5f, h * 0.06f, w * 0.94f, h * 0.5f)
            quadraticBezierTo(w * 0.5f, h * 0.94f, w * 0.06f, h * 0.5f)
            close()
        }

        drawPath(outline, color, style = stroke)
        drawCircle(color, radius = w * 0.14f, center = Offset(w * 0.5f, h * 0.5f))

        // crossed out when the password is hidden
        if (!open) {
            drawLine(
                color = color,
                start = Offset(w * 0.18f, h * 0.84f),
                end = Offset(w * 0.82f, h * 0.16f),
                strokeWidth = w * 0.09f,
                cap = StrokeCap.Round,
            )
        }
    }
}

// The small eye on the right of the password field: only the icon, a button of its own that
// the remote can select (Right on the field jumps to it).
@Composable
fun EyeButton(visible: Boolean, focusRequester: FocusRequester, onClick: () -> Unit) {
    FocusCard(
        onClick = onClick,
        modifier = Modifier.size(56.dp),
        shape = RoundedCornerShape(14.dp),
        container = Color(0x22FFFFFF),
        focusedContainer = Color(0x55FFFFFF),
        borderColor = Color.White,
        focusedScale = 1.06f,
        focusRequester = focusRequester,
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EyeGlyph(open = visible, color = Color.White, glyphSize = 26.dp)
        }
    }
}
