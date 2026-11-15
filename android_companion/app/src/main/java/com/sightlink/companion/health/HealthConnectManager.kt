package com.sightlink.companion.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.sightlink.companion.data.dto.HealthRecordItem
import java.time.Instant
import java.time.temporal.ChronoUnit

class HealthConnectManager(private val context: Context) {

    private val healthConnectClient by lazy {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }
    }

    fun getSdkStatus(): Int {
        return HealthConnectClient.getSdkStatus(context)
    }

    fun isSdkAvailable(): Boolean {
        return getSdkStatus() == HealthConnectClient.SDK_AVAILABLE
    }

    suspend fun getGrantedPermissions(): Set<String> {
        val client = healthConnectClient ?: return emptySet()
        return client.permissionController.getGrantedPermissions()
    }

    suspend fun hasAllPermissions(): Boolean {
        val granted = getGrantedPermissions()
        return granted.containsAll(SupportedPermissions.PERMISSIONS)
    }

    suspend fun readHealthRecords(
        startTime: Instant = Instant.now().minus(24, ChronoUnit.HOURS),
        endTime: Instant = Instant.now()
    ): List<HealthRecordItem> {
        val client = healthConnectClient ?: return emptyList()
        val granted = client.permissionController.getGrantedPermissions()
        val timeFilter = TimeRangeFilter.between(startTime, endTime)
        val records = mutableListOf<HealthRecordItem>()

        // 1. Steps
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapSteps(it) })
        } catch (e: Exception) {
            // Permission not granted or unavailable
        }

        // 2. Heart Rate
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            response.records.forEach { hrRec ->
                records.addAll(RecordMappers.mapHeartRate(hrRec))
            }
        } catch (e: Exception) {
        }

        // 3. Resting Heart Rate
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = RestingHeartRateRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapRestingHeartRate(it) })
        } catch (e: Exception) {
        }

        // 4. Sleep Sessions
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapSleepSession(it) })
        } catch (e: Exception) {
        }

        // 5. Active Calories
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = ActiveCaloriesBurnedRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapActiveCalories(it) })
        } catch (e: Exception) {
        }

        // 6. Total Calories
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = TotalCaloriesBurnedRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapTotalCalories(it) })
        } catch (e: Exception) {
        }

        // 7. Distance
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = DistanceRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapDistance(it) })
        } catch (e: Exception) {
        }

        // 8. Exercise Sessions
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapExerciseSession(it) })
        } catch (e: Exception) {
        }

        // 9. Oxygen Saturation (SpO2)
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapOxygenSaturation(it) })
        } catch (e: Exception) {
        }

        // 10. Blood Pressure
        try {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodPressureRecord::class,
                    timeRangeFilter = timeFilter
                )
            )
            records.addAll(response.records.map { RecordMappers.mapBloodPressure(it) })
        } catch (e: Exception) {
        }

        return records
    }
}

