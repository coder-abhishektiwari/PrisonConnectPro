package com.prisonconnect.kiosk.hardware

import android.content.Context
import android.graphics.*
import android.graphics.ImageFormat.NV21
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.prisonconnect.kiosk.core.Logger
import kotlinx.coroutines.tasks.await
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.sqrt

@Singleton
class FaceAuthProcessor @Inject constructor(
    private val context: Context
) {
    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
            .build()
    )

    suspend fun detectFaces(imageProxy: ImageProxy): List<Face> {
        val image = InputImage.fromMediaImage(imageProxy.image!!, imageProxy.imageInfo.rotationDegrees)
        return try {
            detector.process(image).await()
        } catch (e: Exception) {
            Logger.e("Face detection failed", e)
            emptyList()
        }
    }

    fun validateFace(face: Face, width: Int, height: Int): FaceQuality {
        val bounds = face.boundingBox

        // 1. Check if face is too small (should be at least 30% of the smaller dimension)
        val faceSize = if (width < height) bounds.width().toFloat() / width else bounds.height().toFloat() / height
        if (faceSize < 0.25f) return FaceQuality.TOO_FAR

        // 2. Check if face is centered
        val centerX = bounds.centerX()
        val centerY = bounds.centerY()
        val toleranceX = width * 0.2f
        val toleranceY = height * 0.2f

        if (centerX < (width / 2 - toleranceX) || centerX > (width / 2 + toleranceX) ||
            centerY < (height / 2 - toleranceY) || centerY > (height / 2 + toleranceY)) {
            return FaceQuality.NOT_CENTERED
        }

        // 3. Check orientation
        if (Math.abs(face.headEulerAngleY) > 15 || Math.abs(face.headEulerAngleZ) > 15) {
            return FaceQuality.NOT_STRAIGHT
        }

        return FaceQuality.GOOD
    }

    /**
     * Simple blur detection using Variance of Laplacian.
     * Since we don't have OpenCV, we use a simple pixel-based edge variance check.
     */
    fun isBlurry(bitmap: Bitmap, threshold: Double = 10.0): Boolean {
        val laplacian = calculateLaplacianVariance(bitmap)
        Logger.d("Laplacian Variance: $laplacian")
        return laplacian < threshold
    }

    private fun calculateLaplacianVariance(bitmap: Bitmap): Double {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        var sum = 0.0
        var sumSq = 0.0
        val count = (width - 2) * (height - 2)

        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val center = Color.red(pixels[y * width + x])
                val left = Color.red(pixels[y * width + (x - 1)])
                val right = Color.red(pixels[y * width + (x + 1)])
                val top = Color.red(pixels[(y - 1) * width + x])
                val bottom = Color.red(pixels[(y + 1) * width + x])

                // Laplacian operator: [0, 1, 0; 1, -4, 1; 0, 1, 0]
                val laplaceValue = (left + right + top + bottom - 4 * center).toDouble()
                sum += laplaceValue
                sumSq += laplaceValue * laplaceValue
            }
        }

        val mean = sum / count
        return (sumSq / count) - (mean * mean)
    }

    fun imageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
        return try {
            val yBuffer = imageProxy.planes[0].buffer
            val uBuffer = imageProxy.planes[1].buffer
            val vBuffer = imageProxy.planes[2].buffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            val nv21 = ByteArray(ySize + uSize + vSize)

            yBuffer.get(nv21, 0, ySize)
            vBuffer.get(nv21, ySize, vSize)
            uBuffer.get(nv21, ySize + vSize, uSize)

            val yuvImage = YuvImage(nv21, ImageFormat.NV21, imageProxy.width, imageProxy.height, null)
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, imageProxy.width, imageProxy.height), 90, out)
            val imageBytes = out.toByteArray()

            val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size) ?: return null

            // Rotate bitmap if needed
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            if (rotationDegrees == 0) return bitmap

            val matrix = Matrix()
            matrix.postRotate(rotationDegrees.toFloat())
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (e: Exception) {
            Logger.e("ImageProxy to Bitmap conversion failed", e)
            null
        }
    }

    enum class FaceQuality {
        GOOD, TOO_FAR, NOT_CENTERED, NOT_STRAIGHT, BLURRY, NO_FACE, MULTIPLE_FACES
    }
}
