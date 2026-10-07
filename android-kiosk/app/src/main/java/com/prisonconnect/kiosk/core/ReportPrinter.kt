package com.prisonconnect.kiosk.core

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import java.io.FileOutputStream
import kotlin.math.floor
import kotlin.math.min

/**
 * Sends a fixed-width text receipt to any printer Android can see (USB thermal
 * printers show up as system printers once a print service is enabled), using
 * the stock print dialog - no vendor SDK or Bluetooth/ESC-POS stack needed.
 *
 * The report is laid out as 48 monospace columns, which is what 80 mm paper
 * holds, and the font size is fitted to whatever media the print system picks.
 */
object ReportPrinter {

    private const val CHAR_COLS = 48
    private const val JOB_NAME = "PrisonConnect"
    // 80 mm x 200 mm roll, used when the print system hands back no attributes.
    // The print attributes take microns; the page size itself is read back in mils.
    private const val FALLBACK_WIDTH_UM = 80000
    private const val FALLBACK_HEIGHT_UM = 200000
    private const val FALLBACK_WIDTH_MILS = 3150
    private const val FALLBACK_HEIGHT_MILS = 7874
    private const val MILS_TO_POINTS = 0.072f
    private const val MARGIN_PT = 6f
    private const val LINE_FACTOR = 1.25f
    private const val MIN_LINES_PER_PAGE = 40

    fun print(context: Context, title: String, text: String) {
        val manager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val attributes = PrintAttributes.Builder()
            .setMediaSize(
                PrintAttributes.MediaSize(
                    "PRISONCONNECT_80MM",
                    "80mm",
                    FALLBACK_WIDTH_UM,
                    FALLBACK_HEIGHT_UM
                )
            )
            .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
            .build()
        manager.print("$JOB_NAME - $title", TextReportAdapter(text), attributes)
    }

    private data class PageSpec(
        val widthPoints: Int,
        val heightPoints: Int,
        val textSize: Float,
        val linesPerPage: Int
    )

    private class TextReportAdapter(private val text: String) : PrintDocumentAdapter() {

        private var attributes: PrintAttributes? = null
        private val lines: List<String> by lazy { text.split("\n") }

        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes?,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback,
            extras: Bundle?
        ) {
            if (cancellationSignal != null && cancellationSignal.isCanceled) {
                callback.onLayoutCancelled()
                return
            }
            attributes = newAttributes ?: oldAttributes
            val spec = measure()
            val pages = ((lines.size + spec.linesPerPage - 1) / spec.linesPerPage).coerceAtLeast(1)
            val info = PrintDocumentInfo.Builder(JOB_NAME)
                .setPageCount(pages)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build()
            callback.onLayoutFinished(info, oldAttributes != newAttributes)
        }

        override fun onWrite(
            pages: Array<out PageRange>?,
            destination: ParcelFileDescriptor?,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback
        ) {
            if (cancellationSignal != null && cancellationSignal.isCanceled) {
                callback.onWriteCancelled()
                return
            }
            if (destination == null) {
                callback.onWriteFailed("No print destination")
                return
            }

            try {
                val spec = measure()
                val document = PdfDocument()
                try {
                    var lineIndex = 0
                    var pageNumber = 1

                    while (lineIndex < lines.size) {
                        val start = lineIndex
                        val end = minOf(lineIndex + spec.linesPerPage, lines.size)
                        // PageRange indices are 0-based, PdfDocument pages are 1-based.
                        if (isRequested(pages, pageNumber)) {
                            val pageInfo = PdfDocument.PageInfo.Builder(
                                spec.widthPoints,
                                spec.heightPoints,
                                pageNumber
                            ).create()
                            val page = document.startPage(pageInfo)
                            drawLines(page.canvas, spec, lines.subList(start, end))
                            document.finishPage(page)
                        }
                        lineIndex = end
                        pageNumber += 1
                    }

                    FileOutputStream(destination.fileDescriptor).use { stream ->
                        document.writeTo(stream)
                    }
                } finally {
                    document.close()
                }
                callback.onWriteFinished(pages ?: arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                callback.onWriteFailed(e.message ?: e.javaClass.simpleName)
            }
        }

        private fun isRequested(requested: Array<out PageRange>?, pageNumber: Int): Boolean {
            if (requested.isNullOrEmpty()) return true
            val index = pageNumber - 1
            return requested.any { index in it.getStart()..it.getEnd() }
        }

        private fun drawLines(canvas: android.graphics.Canvas, spec: PageSpec, slice: List<String>) {
            val paint = Paint().apply {
                typeface = Typeface.MONOSPACE
                textSize = spec.textSize
                color = Color.BLACK
                isAntiAlias = true
            }
            val font = paint.fontMetrics
            val lineHeight = spec.textSize * LINE_FACTOR
            val firstBaseline = MARGIN_PT - font.ascent
            slice.forEachIndexed { i, line ->
                canvas.drawText(line, MARGIN_PT, firstBaseline + i * lineHeight, paint)
            }
        }

        private fun measure(): PageSpec {
            val media = attributes?.mediaSize
            // MediaSize reports its size in mils (1/1000 inch): 1 mil = 0.072 pt.
            val widthMils = media?.widthMils ?: FALLBACK_WIDTH_MILS
            val heightMils = media?.heightMils ?: FALLBACK_HEIGHT_MILS
            val widthPoints = (widthMils * MILS_TO_POINTS).toInt().coerceAtLeast(1)
            val heightPoints = (heightMils * MILS_TO_POINTS).toInt().coerceAtLeast(1)
            val contentWidth = (widthPoints - 2 * MARGIN_PT).coerceAtLeast(1f)
            val contentHeight = (heightPoints - 2 * MARGIN_PT).coerceAtLeast(1f)

            val probe = Paint().apply {
                typeface = Typeface.MONOSPACE
                textSize = 100f
            }
            val charWidth = probe.measureText("0") / 100f
            val widthFit = contentWidth / (CHAR_COLS * charWidth.coerceAtLeast(0.01f))
            val heightFit = contentHeight / (MIN_LINES_PER_PAGE * LINE_FACTOR)
            val textSize = min(widthFit, heightFit).coerceAtLeast(6f)
            val lineHeight = textSize * LINE_FACTOR
            val linesPerPage = floor(contentHeight / lineHeight).toInt().coerceAtLeast(1)

            return PageSpec(widthPoints, heightPoints, textSize, linesPerPage)
        }
    }
}
