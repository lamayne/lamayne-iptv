plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.lamayne.iptv.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lamayne.iptv.tv"
        // Android 6.0: the oldest version with the encrypted key storage (Keystore AES-GCM).
        minSdk = 23
        targetSdk = 35
        versionCode = 15
        versionName = "0.11.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

// The app emblem lives in the repository (public/brand). It is copied into the
// Android resources at build time; the app draws a substitute if it is missing.
val copyBrand by tasks.registering(Copy::class) {
    from(rootProject.file("../public/brand/lamayne-emblem.png"))
    into(layout.projectDirectory.dir("src/main/res/drawable-nodpi"))
    rename { "lamayne_emblem.png" }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(copyBrand)
}

dependencies {
    // QR code of the support link (most TVs have no browser)
    implementation("com.google.zxing:core:3.5.3")
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))

    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.tv:tv-material:1.0.0")

    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("androidx.media3:media3-datasource:1.5.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
