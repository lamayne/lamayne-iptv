package com.lamayne.iptv.tv.data

import java.net.SocketTimeoutException
import java.net.UnknownHostException

fun toUiError(e: Exception): UiError =
    when (e) {
        is XtreamClient.AuthException -> UiError.AuthRefused
        is IllegalArgumentException -> UiError.InvalidAddress
        is UnknownHostException -> UiError.ServerNotFound
        is SocketTimeoutException -> UiError.Timeout
        is XtreamClient.HttpException -> UiError.Http(e.code)
        else -> UiError.Other(e.message)
    }
