package com.sightlink.companion.data.dto

import com.google.gson.annotations.SerializedName

data class RegisterDeviceRequest(
    @SerializedName("pairing_code") val pairingCode: String,
    @SerializedName("device_name") val deviceName: String,
    @SerializedName("device_model") val deviceModel: String?,
    @SerializedName("os_version") val osVersion: String?,
    @SerializedName("app_version") val appVersion: String? = "1.0.0"
)

data class RegisterDeviceResponse(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_token") val deviceToken: String,
    @SerializedName("device_name") val deviceName: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("message") val message: String
)

data class HealthRecordItem(
    @SerializedName("client_record_id") val clientRecordId: String,
    @SerializedName("record_type") val recordType: String,
    @SerializedName("start_time") val startTime: String?,
    @SerializedName("end_time") val endTime: String?,
    @SerializedName("value_num") val valueNum: Double?,
    @SerializedName("secondary_value_num") val secondaryValueNum: Double? = null,
    @SerializedName("unit") val unit: String,
    @SerializedName("data_source") val dataSource: String? = null,
    @SerializedName("metadata_json") val metadataJson: String? = null
)

data class HealthSyncBatchRequest(
    @SerializedName("device_token") val deviceToken: String?,
    @SerializedName("records") val records: List<HealthRecordItem>,
    @SerializedName("sync_trigger") val syncTrigger: String = "manual"
)

data class HealthSyncBatchResponse(
    @SerializedName("status") val status: String,
    @SerializedName("records_received") val recordsReceived: Int,
    @SerializedName("records_inserted") val recordsInserted: Int,
    @SerializedName("records_updated") val recordsUpdated: Int,
    @SerializedName("synced_at") val syncedAt: String
)

data class HealthConsentItem(
    @SerializedName("permission_name") val permissionName: String,
    @SerializedName("granted") val granted: Boolean
)

data class UpdateConsentsRequest(
    @SerializedName("device_token") val deviceToken: String?,
    @SerializedName("consents") val consents: List<HealthConsentItem>
)

