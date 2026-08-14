package com.prisonconnect.kiosk.core

import android.util.Log

/**
 * Centralized logging utility. All kiosk logs go through this class.
 */
object Logger {
    private const val TAG = Constants.LOG_TAG

    fun d(message: String) = Log.d(TAG, message)

    fun i(message: String) = Log.i(TAG, message)

    fun w(message: String) = Log.w(TAG, message)

    fun e(message: String, throwable: Throwable? = null) {
        if (throwable == null) Log.e(TAG, message) else Log.e(TAG, message, throwable)
    }
}