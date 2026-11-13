package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

// A drop-down choice: a field that shows the current value and a small arrow; selecting it opens
// the list of choices, and the one picked closes it. (A real pop-up menu does not follow the
// remote control well, so the list is a small window of its own.)
@Composable
fun SelectField(
    title: String,
    options: List<Pair<String, String>>,
    selectedKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == selectedKey }?.second ?: selectedKey

    FocusCard(
        onClick = { open = true },
        modifier = modifier.widthIn(min = 280.dp),
        shape = RoundedCornerShape(14.dp),
        container = Color(0x22FFFFFF),
        focusedContainer = Color(0x44FFFFFF),
        borderColor = Accent,
        focusedScale = 1.03f,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                current,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )

            Spacer(Modifier.width(18.dp))

            // the arrow of the drop-down
            Canvas(modifier = Modifier.size(width = 16.dp, height = 10.dp)) {
                val stroke = size.height * 0.28f

                drawLine(
                    Color(0xFFB8B8CC),
                    Offset(0f, size.height * 0.15f),
                    Offset(size.width / 2f, size.height * 0.85f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    Color(0xFFB8B8CC),
                    Offset(size.width, size.height * 0.15f),
                    Offset(size.width / 2f, size.height * 0.85f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }
        }
    }

    if (open) {
        val selectedFocus = remember { FocusRequester() }

        LaunchedEffect(Unit) { runCatching { selectedFocus.requestFocus() } }

        Dialog(onDismissRequest = { open = false }) {
            Column(
                modifier = Modifier
                    .width(400.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Panel)
                    .padding(22.dp),
            ) {
                Text(title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)

                Spacer(Modifier.size(14.dp))

                LazyColumn(
                    modifier = Modifier.heightIn(max = 340.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(options) { (key, label) ->
                        val selected = key == selectedKey

                        FocusCard(
                            onClick = {
                                open = false
                                onSelect(key)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            focusedScale = 1.02f,
                            focusRequester = if (selected) selectedFocus else null,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Spacer(
                                    Modifier
                                        .size(16.dp)
                                        .clip(CircleShape)
                                        .background(if (selected) Accent else Color(0x33FFFFFF)),
                                )

                                Spacer(Modifier.width(14.dp))

                                Text(
                                    label,
                                    color = TextMain,
                                    fontSize = 17.sp,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
