import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Custom keys in local.properties are NOT auto-exposed to findProperty (only
// sdk.dir is). Load them explicitly so endpoint config lives in ONE file and
// survives rebuilds without touching this script.
val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun appProp(name: String, fallback: String): String =
    (project.findProperty(name) as String?)
        ?: localProperties.getProperty(name)?.trim()?.takeIf { it.isNotEmpty() }
        ?: fallback

android {
    namespace = "com.prisonconnect.kiosk"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.prisonconnect.kiosk"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Kiosk identity & backend endpoint.
        // Priority: gradle -P flag > local.properties > default below.
        // NOTE: SIGNALING_URL is only a FALLBACK - at runtime the backend
        // delivers the fresh public signaling URL inside every create-call
        // response, so tunnel changes never require a rebuild.
        // Defaults point at the real deployed services (Render).
        val kioskId = appProp("KIOSK_ID", "KIOSK-001")
        val trustApiHost = appProp("KIOSK_TRUST_API_HOST", "https://prisonconnect-backend.onrender.com")
        val apiBaseUrl = appProp("API_BASE_URL", "https://prisonconnect-backend.onrender.com")
        val signalingUrl = appProp("SIGNALING_URL", "https://prisonconnect-signaling.onrender.com")
        val turnServerUrl = appProp("TURN_SERVER_URL", "turn:tissues-cafeteria.tun.ply.gg:3478")
        val turnTlsUrl = appProp("TURN_TLS_URL", "turns:tissues-cafeteria.tun.ply.gg:5349")
        val turnUsername = appProp("TURN_USERNAME", "turnuser")
        val turnCredential = appProp("TURN_CREDENTIAL", "turnpass")

        buildConfigField("String", "KIOSK_ID", "\"$kioskId\"")
        buildConfigField("String", "TRUST_API_HOST", "\"$trustApiHost\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "SIGNALING_URL", "\"$signalingUrl\"")
        buildConfigField("String", "TURN_SERVER_URL", "\"$turnServerUrl\"")
        buildConfigField("String", "TURN_TLS_URL", "\"$turnTlsUrl\"")
        buildConfigField("String", "TURN_USERNAME", "\"$turnUsername\"")
        buildConfigField("String", "TURN_CREDENTIAL", "\"$turnCredential\"")

        ndk {
            abiFilters.addAll(listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64"))
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }
}

dependencies {
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    // AndroidX Core & Lifecycle
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.fragment.ktx)

    // Jetpack Compose (Material 3)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.material3.adaptive)
    implementation(libs.androidx.compose.material3.window.size)

    // Navigation Compose
    implementation(libs.androidx.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // Network Layer (Retrofit + OkHttp)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.mockwebserver)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play)

    // Socket.IO Client (WebRTC signaling)
    implementation(libs.socketio.client)

    // WebRTC Native Client
    implementation(libs.google.webrtc)

    // Coil (image loading)
    implementation(libs.coil.compose)

    // CameraX
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    // ML Kit Face Detection
    implementation(libs.mlkit.face.detection)

    // DataStore (secure token persistence)
    implementation(libs.androidx.datastore.preferences)
}
