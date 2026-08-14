package com.prisonconnect.kiosk.di

import com.prisonconnect.kiosk.api.TrustApiService
import com.prisonconnect.kiosk.config.AppConfig
import com.prisonconnect.kiosk.network.interceptors.AuthInterceptor
import com.prisonconnect.kiosk.network.interceptors.EnvironmentInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        deviceInterceptor: com.prisonconnect.kiosk.network.interceptors.DeviceInterceptor,
        loggingInterceptor: HttpLoggingInterceptor,
        environmentInterceptor: EnvironmentInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(environmentInterceptor)
        .addInterceptor(deviceInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .connectTimeout(AppConfig.NETWORK_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(AppConfig.NETWORK_TIMEOUT, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(AppConfig.baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    @Provides
    @Singleton
    fun provideTrustApiService(retrofit: Retrofit): TrustApiService =
        retrofit.create(TrustApiService::class.java)
}
