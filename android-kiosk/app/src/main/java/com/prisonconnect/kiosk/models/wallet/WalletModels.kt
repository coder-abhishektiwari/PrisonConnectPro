package com.prisonconnect.kiosk.models.wallet

import com.google.gson.annotations.SerializedName

/** Jail-account statement returned by GET /inmate/wallet/:id (nested under API `data`). */
data class WalletStatement(
    @SerializedName("wallet") val wallet: WalletInfo,
    @SerializedName("transactions") val transactions: List<WalletTransaction>
)

data class WalletInfo(
    @SerializedName("walletId") val walletId: String,
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("balance") val balance: Double,
    @SerializedName("currency") val currency: String = "INR",
    @SerializedName("status") val status: String = "active"
)

data class WalletTransaction(
    @SerializedName("transactionId") val transactionId: String,
    @SerializedName("type") val type: String = "charge",
    @SerializedName("amount") val amount: Double,
    @SerializedName("currency") val currency: String = "INR",
    @SerializedName("status") val status: String = "success",
    @SerializedName("timestamp") val timestamp: String? = null,
    @SerializedName("description") val description: String? = null,
    @SerializedName("callId") val callId: String? = null
) {
    /** True when money was deducted from the inmate's balance (e.g. call charge). */
    val isDebit: Boolean get() = type.equals("charge", ignoreCase = true)

    val displayDescription: String
        get() = when {
            !description.isNullOrBlank() -> description
            isDebit -> "Call / service charge"
            else -> "Wallet recharge"
        }
}