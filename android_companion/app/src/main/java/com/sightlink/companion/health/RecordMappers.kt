package com.sightlink.companion.health

import androidx.health.connect.client.records.*
import com.google.gson.Gson
import com.sightlink.companion.data.dto.HealthRecordItem

object RecordMappers {
    private val gson = Gson()

    fun mapSteps(record: StepsRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "steps",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = record.count.toDouble(),
            unit = "count",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapHeartRate(record: HeartRateRecord): List<HealthRecordItem> {
        val packageName = record.metadata.dataOrigin.packageName
        return record.samples.mapIndexed { index, sample ->
            HealthRecordItem(
                clientRecordId = "${record.metadata.id}_$index",
                recordType = "heart_rate",
                startTime = sample.time.toString(),
                endTime = sample.time.toString(),
                valueNum = sample.beatsPerMinute.toDouble(),
                unit = "bpm",
                dataSource = packageName
            )
        }
    }

    fun mapRestingHeartRate(record: RestingHeartRateRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "resting_heart_rate",
            startTime = record.time.toString(),
            endTime = record.time.toString(),
            valueNum = record.beatsPerMinute.toDouble(),
            unit = "bpm",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapSleepSession(record: SleepSessionRecord): HealthRecordItem {
        val stagesMap = mutableMapOf<String, Long>()
        for (stage in record.stages) {
            val durationSec = (stage.endTime.epochSecond - stage.startTime.epochSecond).coerceAtLeast(0)
            val durationMin = durationSec / 60
            val stageName = when (stage.stage) {
                SleepSessionRecord.StageType.STAGE_TYPE_DEEP -> "deep"
                SleepSessionRecord.StageType.STAGE_TYPE_REM -> "rem"
                SleepSessionRecord.StageType.STAGE_TYPE_LIGHT -> "light"
                SleepSessionRecord.StageType.STAGE_TYPE_AWAKE -> "awake"
                else -> "other"
            }
            stagesMap[stageName] = (stagesMap[stageName] ?: 0L) + durationMin
        }

        val metaJson = if (stagesMap.isNotEmpty()) {
            gson.toJson(mapOf("stages" to stagesMap, "title" to (record.title ?: "Sleep")))
        } else {
            gson.toJson(mapOf("title" to (record.title ?: "Sleep")))
        }

        val totalDurationMin = ((record.endTime.epochSecond - record.startTime.epochSecond) / 60).toDouble()

        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "sleep_session",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = totalDurationMin,
            unit = "minutes",
            dataSource = record.metadata.dataOrigin.packageName,
            metadataJson = metaJson
        )
    }

    fun mapActiveCalories(record: ActiveCaloriesBurnedRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "active_calories",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = record.energy.inKilocalories,
            unit = "kcal",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapTotalCalories(record: TotalCaloriesBurnedRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "total_calories",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = record.energy.inKilocalories,
            unit = "kcal",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapDistance(record: DistanceRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "distance",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = record.distance.inMeters,
            unit = "meters",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapExerciseSession(record: ExerciseSessionRecord): HealthRecordItem {
        val durationMin = ((record.endTime.epochSecond - record.startTime.epochSecond) / 60).toDouble()
        val metaJson = gson.toJson(
            mapOf(
                "title" to (record.title ?: "Exercise"),
                "exercise_type" to record.exerciseType
            )
        )
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "exercise",
            startTime = record.startTime.toString(),
            endTime = record.endTime.toString(),
            valueNum = durationMin,
            unit = "minutes",
            dataSource = record.metadata.dataOrigin.packageName,
            metadataJson = metaJson
        )
    }

    fun mapOxygenSaturation(record: OxygenSaturationRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "spo2",
            startTime = record.time.toString(),
            endTime = record.time.toString(),
            valueNum = record.percentage.value,
            unit = "percent",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }

    fun mapBloodPressure(record: BloodPressureRecord): HealthRecordItem {
        return HealthRecordItem(
            clientRecordId = record.metadata.id,
            recordType = "blood_pressure",
            startTime = record.time.toString(),
            endTime = record.time.toString(),
            valueNum = record.systolic.inMillimetersOfMercury,
            secondaryValueNum = record.diastolic.inMillimetersOfMercury,
            unit = "mmHg",
            dataSource = record.metadata.dataOrigin.packageName
        )
    }
}

