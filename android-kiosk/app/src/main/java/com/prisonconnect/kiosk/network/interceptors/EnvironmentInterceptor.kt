package com.prisonconnect.kiosk.network.interceptors

import com.prisonconnect.kiosk.config.AppConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EnvironmentInterceptor @Inject constructor() : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()

            val url = AppConfig.baseUrl.toHttpUrlOrNull()
            if (url != null) {
                val newUrl = request.url.newBuilder()
                    .scheme(url.scheme)
                    .host(url.host)
                    .port(url.port)
                    .build()
                request = request.newBuilder().url(newUrl).build()
            }

        return chain.proceed(request)
    }
}
