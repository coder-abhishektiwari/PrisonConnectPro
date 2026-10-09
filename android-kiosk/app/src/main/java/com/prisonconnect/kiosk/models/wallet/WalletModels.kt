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
    @SerializedName("status") val status: String = "active",
    @SerializedName("totalSpent") val totalSpent: Double = 0.0,
    @SerializedName("lastRecharge") val lastRecharge: String? = null,
    @SerializedName("lastRechargeAmount") val lastRechargeAmount: Double? = null,
    @SerializedName("remainingMinutes") val remainingMinutes: Int = 0
)

data class WalletTransaction(
    @SerializedName("transactionId") val transactionId: String,
    @SerializedName("type") val type: String = "charge",
    @SerializedName("amount") val amount: Double,
    @SerializedName("currency") val currency: String = "INR",
    @SerializedName("status") val status: String = "success",
    @SerializedName("timestamp") val timestamp: String? = null,
    @SerializedName("description") val description: String? = null,
    @SerializedName("callId") val callId: String? = null,
    // Razorpay deposit detail: amount = net credited, grossAmount = what the
    // family actually paid. Absent on legacy/manual recharges.
    @SerializedName("grossAmount") val grossAmount: Double? = null,
    @SerializedName("fee") val fee: Double? = null,
    @SerializedName("tax") val tax: Double? = null,
    @SerializedName("gateway") val gateway: String? = null
) {
    /** True when money was deducted from the inmate's balance (e.g. call charge). */
    val isDebit: Boolean get() = type.equals("charge", ignoreCase = true)

    /** Only fully settled entries are counted in the statement. */
    val isSettled: Boolean
        get() = status.equals("success", ignoreCase = true) || status.equals("completed", ignoreCase = true)

    val displayDescription: String
        get() = when {
            !description.isNullOrBlank() -> description
            isDebit -> "Call / service charge"
            else -> "Wallet recharge"
        }

    /**
     * Grey sub-line for online deposits: "Paid Rs.100.00 - charges Rs.2.36".
     * Only for Razorpay rows where a gateway charge was actually taken.
     */
    val chargesSubLine: String?
        get() {
            if (!gateway.equals("razorpay", ignoreCase = true)) return null
            val gross = grossAmount ?: return null
            val charges = gross - amount
            if (charges <= 0.0) return null
            return "Paid \u20B9${String.format("%.2f", gross)} \u00B7 charges \u20B9${String.format("%.2f", charges)}"
        }
}

/** POST /inmate/wallet-requests body (kiosk keypad amount request). */
data class WalletRequestPayload(
    @SerializedName("amount") val amount: Int,
    @SerializedName("note") val note: String? = null
)

/** Pending balance request row returned by POST /inmate/wallet-requests. */
data class WalletRequest(
    @SerializedName("requestId") val requestId: String,
    @SerializedName("inmateId") val inmateId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("status") val status: String = "pending",
    @SerializedName("requestedAt") val requestedAt: String? = null
)