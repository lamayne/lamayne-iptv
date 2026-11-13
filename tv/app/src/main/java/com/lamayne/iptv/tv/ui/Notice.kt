package com.lamayne.iptv.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lamayne.iptv.tv.MainViewModel
import com.lamayne.iptv.tv.R

// "Added to favourites: TF1", at the bottom of the screen for two seconds.
@Composable
fun NoticePill(notice: MainViewModel.Notice) {
    val shape = RoundedCornerShape(50)

    Row(
        modifier = Modifier
            .background(Color(0xEE13131F), shape)
            .border(1.dp, if (notice.added) Color(0x888B5CF6) else Color(0x33FFFFFF), shape)
            .padding(horizontal = 22.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (notice.added) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            contentDescription = null,
            tint = if (notice.added) Accent else Color.White,
            modifier = Modifier.size(20.dp),
        )

        Spacer(Modifier.width(12.dp))

        Text(
            stringResource(if (notice.added) R.string.fav_added else R.string.fav_removed, notice.name),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
