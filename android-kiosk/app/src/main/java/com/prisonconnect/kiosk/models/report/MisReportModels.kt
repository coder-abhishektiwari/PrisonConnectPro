package com.prisonconnect.kiosk.models.report

import com.google.gson.annotations.SerializedName

data class CallsMisReport(
    @SerializedName("kioskId") val kioskId: String = "",
    @SerializedName("kioskName") val kioskName: String = "",
    @SerializedName("prisonName") val prisonName: String = "",
    @SerializedName("from") val from: String = "",
    @SerializedName("to") val to: String = "",
    @SerializedName("summary") val summary: MisSummary = MisSummary(),
    @SerializedName("duration") val duration: MisDuration = MisDuration()
)

data class MisSummary(
    @SerializedName("totalCalls") val totalCalls: Int = 0,
    @SerializedName("completed") val completed: Int = 0,
    @SerializedName("notAnswered") val notAnswered: Int = 0,
    @SerializedName("forceEnded") val forceEnded: Int = 0,
    @SerializedName("video") val video: Int = 0,
    @SerializedName("audio") val audio: Int = 0
)

data class MisDuration(
    @SerializedName("connectedCalls") val connectedCalls: Int = 0,
    @SerializedName("totalTalkSeconds") val totalTalkSeconds: Long = 0,
    @SerializedName("averageSeconds") val averageSeconds: Long = 0,
    @SerializedName("longestSeconds") val longestSeconds: Long = 0,
    @SerializedName("shortestSeconds") val shortestSeconds: Long = 0
)
