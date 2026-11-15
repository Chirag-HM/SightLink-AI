package com.sightlink.companion.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.sightlink.companion.data.api.SightLinkHealthApi
import com.sightlink.companion.data.dto.HealthSyncBatchRequest
import com.sightlink.companion.data.preferences.AppPreferences
import com.sightlink.companion.health.HealthConnectManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

class HealthSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val prefs = AppPreferences(applicationContext)
        val token = prefs.deviceToken

        if (!prefs.isPaired || token.isNullOrBlank()) {
            return Result.failure()
        }

        val healthManager = HealthConnectManager(applicationContext)
        if (!healthManager.isSdkAvailable()) {
            return Result.failure()
        }

        try {
            // Read records from the past 24 hours
            val now = Instant.now()
            val startTime = now.minus(24, ChronoUnit.HOURS)
            val records = healthManager.readHealthRecords(startTime, now)

            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val okHttp = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .addInterceptor(logging)
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(prefs.serverUrl)
                .client(okHttp)
                .addConverterFactory(GsonConverterFactory.create())
                .build()

            val api = retrofit.create(SightLinkHealthApi::class.java)

            val request = HealthSyncBatchRequest(
                deviceToken = token,
                records = records,
                syncTrigger = inputData.getString("trigger") ?: "periodic"
            )

            val response = api.syncHealthRecords(token, request)
            return if (response.isSuccessful && response.body() != null) {
                prefs.lastSyncTimestamp = response.body()?.syncedAt ?: now.toString()
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            return Result.retry()
        }
    }
}

