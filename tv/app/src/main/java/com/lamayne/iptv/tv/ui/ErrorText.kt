package com.lamayne.iptv.tv.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.lamayne.iptv.tv.R
import com.lamayne.iptv.tv.data.UiError

// The message for an error, in the language of the app.
@Composable
fun UiError.errorText(): String =
    when (this) {
        UiError.FillFields -> stringResource(R.string.err_fill_fields)
        UiError.AuthRefused -> stringResource(R.string.err_auth)
        UiError.InvalidAddress -> stringResource(R.string.err_address)
        UiError.ServerNotFound -> stringResource(R.string.err_server_not_found)
        UiError.Timeout -> stringResource(R.string.err_timeout)
        is UiError.Http -> stringResource(R.string.err_http, code)
        is UiError.Other -> text ?: stringResource(R.string.err_generic)
    }
