package com.prisonconnect.kiosk.network.interceptors

import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.config.Environment
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EnvironmentInterceptor @Inject constructor() : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()

        if (AppConfig.environment == Environment.MOCK) {
            val mockUrl = AppConfig.baseUrl.toHttpUrlOrNull()
            if (mockUrl != null) {
                val newUrl = request.url.newBuilder()
                    .scheme(mockUrl.scheme)
                    .host(mockUrl.host)
                    .port(mockUrl.port)
                    .build()
                request = request.newBuilder().url(newUrl).build()
            }
        }

        return chain.proceed(request)
    }
}
