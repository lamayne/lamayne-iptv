package com.lamayne.iptv.tv.data

data class Credentials(
    val server: String,
    val user: String,
    val pass: String,
)

data class Category(
    val id: String,
    val name: String,
)

data class Channel(
    val id: String,
    val name: String,
    val icon: String?,
    val categoryId: String?,
)
