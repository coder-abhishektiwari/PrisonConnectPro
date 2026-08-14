package com.prisonconnect.kiosk.models.receipt

import com.google.gson.annotations.SerializedName

data class Transaction(
    @SerializedName("transactionId") val transactionId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("description") val description: String,
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("status") val status: TransactionStatus
)

enum class TransactionStatus {
    @SerializedName("pending") PENDING,
    @SerializedName("completed") COMPLETED,
    @SerializedName("failed") FAILED
}

data class Receipt(
    @SerializedName("receiptId") val receiptId: String,
    @SerializedName("transaction") val transaction: Transaction,
    @SerializedName("kioskId") val kioskId: String,
    @SerializedName("location") val location: String
)
