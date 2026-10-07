package com.prisonconnect.kiosk.core

import com.prisonconnect.kiosk.models.report.CallsMisReport
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Renders a [CallsMisReport] as a fixed 48-column receipt. 80 mm thermal paper
 * prints about 48 monospace characters per line, so every helper here keeps its
 * output exactly 48 columns wide - that also makes the on-screen preview show
 * precisely what the printer will produce.
 */
object MisReportFormatter {

    private const val WIDTH = 48
    private val RULE = "=".repeat(WIDTH)
    private val DASH = "-".repeat(WIDTH)

    private val ISO_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH)
    private val SHORT_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("dd MMM", Locale.ENGLISH)
    private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("dd MMM yy, HH:mm", Locale.ENGLISH)

    fun build(
        report: CallsMisReport,
        preparedBy: String,
        zone: ZoneId = ZoneId.systemDefault()
    ): String {
        val summary = report.summary
        val duration = report.duration
        val lines = mutableListOf<String>()

        lines += RULE
        lines += center("PRISON CONNECT")
        lines += center(report.prisonName.ifBlank { "PRISON CONNECT" }.uppercase(Locale.ROOT))
        lines += RULE
        lines += center("CALLS MIS REPORT")
        lines += DASH
        lines += labelled("Kiosk ID", report.kioskId)
        lines += labelled("Period", periodLabel(report.from, report.to))
        lines += labelled("Generated", STAMP.format(java.time.ZonedDateTime.now(zone)))
        lines += labelled("Prepared by", preparedBy.ifBlank { "-" })
        lines += DASH
        lines += center("SUMMARY")
        lines += DASH
        lines += numbered("Total calls", summary.totalCalls.toString())
        lines += share("Completed", summary.completed, summary.totalCalls)
        lines += share("Failed / no answer", summary.notAnswered, summary.totalCalls)
        lines += share("Force ended", summary.forceEnded, summary.totalCalls)
        lines += numbered("Video", summary.video.toString())
        lines += numbered("Audio", summary.audio.toString())
        lines += DASH
        lines += center("DURATION")
        lines += DASH
        lines += numbered("Total talk time", hoursMinutes(duration.totalTalkSeconds))
        lines += numbered("Average call", clock(duration.averageSeconds))
        lines += numbered("Longest call", clock(duration.longestSeconds))
        lines += numbered("Shortest call", clock(duration.shortestSeconds))
        lines += RULE

        return lines.joinToString("\n")
    }

    /** "01 Oct - 07 Oct 25" */
    private fun periodLabel(from: String, to: String): String {
        val start = runCatching { LocalDate.parse(from, ISO_DAY) }.getOrNull()
        val end = runCatching { LocalDate.parse(to, ISO_DAY) }.getOrNull()
        if (start == null || end == null) return "$from - $to"
        val year = "%02d".format(end.year % 100)
        return "${SHORT_DAY.format(start)} - ${SHORT_DAY.format(end)} $year"
    }

    private fun center(text: String): String {
        val body = fit(text)
        val pad = (WIDTH - body.length).coerceAtLeast(0)
        return " ".repeat(pad / 2) + body + " ".repeat(pad - pad / 2)
    }

    /** "Kiosk ID    : KIOSK-A1B2C3D4" */
    private fun labelled(label: String, value: String): String {
        val line = "${fit(label).padEnd(12)}: ${fit(value)}"
        return line.take(WIDTH)
    }

    /** Label left, value flush to the right margin: "Total calls           428". */
    private fun numbered(label: String, value: String): String {
        val v = fit(value)
        val l = fit(label)
        if (l.length + 1 + v.length > WIDTH) return "$l $v".take(WIDTH)
        return l.padEnd(WIDTH - v.length) + v
    }

    /** Indented breakdown line with count and percentage: "  Completed   361   84.3%". */
    private fun share(label: String, count: Int, total: Int): String {
        val pct = if (total > 0) {
            String.format(Locale.ENGLISH, "%.1f%%", count * 100.0 / total)
        } else {
            "0.0%"
        }
        val countText = count.toString()
        val left = "  ${fit(label)}"
        // Count right-aligned ending at column 40, percentage right-aligned at 48.
        val head = left.padEnd((40 - countText.length).coerceAtLeast(left.length))
        return head + countText + pct.padStart(8)
    }

    /** "412h 30m" */
    private fun hoursMinutes(seconds: Long): String {
        val total = seconds.coerceAtLeast(0)
        return "%02dh %02dm".format(total / 3600, (total % 3600) / 60)
    }

    /** "07m 12s" */
    private fun clock(seconds: Long): String {
        val total = seconds.coerceAtLeast(0)
        return "%02dm %02ds".format(total / 60, total % 60)
    }

    private fun fit(text: String): String =
        if (text.length > WIDTH) text.substring(0, WIDTH) else text
}
