package com.sightlink.companion.data.api

import com.sightlink.companion.data.dto.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface SightLinkHealthApi {

    @POST("/api/health-connect/devices/register")
    suspend fun registerDevice(
        @Body request: RegisterDeviceRequest
    ): Response<RegisterDeviceResponse>

    @POST("/api/health-connect/consents")
    suspend fun updateConsents(
        @Header("X-Device-Token") deviceToken: String,
        @Body request: UpdateConsentsRequest
    ): Response<Map<String, Any>>

    @POST("/api/health-connect/records/sync")
    suspend fun syncHealthRecords(
        @Header("X-Device-Token") deviceToken: String,
        @Body request: HealthSyncBatchRequest
    ): Response<HealthSyncBatchResponse>
}

