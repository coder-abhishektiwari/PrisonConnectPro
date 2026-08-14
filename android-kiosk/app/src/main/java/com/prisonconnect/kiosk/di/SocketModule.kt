package com.prisonconnect.kiosk.di

import com.prisonconnect.kiosk.core.Constants
import com.prisonconnect.kiosk.socket.SocketService
import com.prisonconnect.kiosk.socket.SocketServiceImpl
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.socket.client.IO
import io.socket.client.Socket
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SocketModule {

    @Binds
    @Singleton
    abstract fun bindSocketService(
        socketServiceImpl: SocketServiceImpl
    ): SocketService

    companion object {
        @Provides
        @Singleton
        fun provideSocket(): Socket {
            return IO.socket(Constants.SIGNALING_SERVER_URL)
        }
    }
}
