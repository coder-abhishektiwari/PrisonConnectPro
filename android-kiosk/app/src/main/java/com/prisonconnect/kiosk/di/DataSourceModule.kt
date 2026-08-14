package com.prisonconnect.kiosk.di

import com.prisonconnect.kiosk.datasource.*
import com.prisonconnect.kiosk.datasource.remote.*
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataSourceModule {

    @Binds
    @Singleton
    abstract fun bindAuthDataSource(
        remoteAuthDataSource: RemoteAuthDataSource
    ): AuthDataSource

    @Binds
    @Singleton
    abstract fun bindInmateDataSource(
        remoteInmateDataSource: RemoteInmateDataSource
    ): InmateDataSource

    @Binds
    @Singleton
    abstract fun bindContactDataSource(
        remoteContactDataSource: RemoteContactDataSource
    ): ContactDataSource

    @Binds
    @Singleton
    abstract fun bindAdminDataSource(
        remoteAdminDataSource: RemoteAdminDataSource
    ): AdminDataSource
}
