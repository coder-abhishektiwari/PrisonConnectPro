package com.prisonconnect.kiosk.di

import com.prisonconnect.kiosk.socket.SocketService
import com.prisonconnect.kiosk.socket.SocketServiceImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SocketModule {

    @Binds
    @Singleton
    abstract fun bindSocketService(
        socketServiceImpl: SocketServiceImpl
    ): SocketService
}
