package com.prisonconnect.kiosk.network.interceptors

import com.prisonconnect.kiosk.hardware.DeviceInfoProvider
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interceptor to attach Device Fingerprint and current IP Address to every API request.
 */
@Singleton
class DeviceInterceptor @Inject constructor(
    private val deviceInfoProvider: DeviceInfoProvider
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val fingerprint = deviceInfoProvider.getDeviceFingerprint()
        val ipAddress = deviceInfoProvider.getIpAddress() ?: "0.0.0.0"

        val requestBuilder = originalRequest.newBuilder()
            .header("X-Device-Fingerprint", fingerprint)
            .header("X-Device-IP", ipAddress)

        return chain.proceed(requestBuilder.build())
    }
}
