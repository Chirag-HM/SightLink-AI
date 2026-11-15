package com.sightlink.companion

import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import com.sightlink.companion.data.api.SightLinkHealthApi
import com.sightlink.companion.data.dto.RegisterDeviceRequest
import com.sightlink.companion.data.dto.UpdateConsentsRequest
import com.sightlink.companion.data.dto.HealthConsentItem
import com.sightlink.companion.data.preferences.AppPreferences
import com.sightlink.companion.databinding.ActivityMainBinding
import com.sightlink.companion.health.HealthConnectManager
import com.sightlink.companion.health.SupportedPermissions
import com.sightlink.companion.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: AppPreferences
    private lateinit var healthManager: HealthConnectManager

    // Official Health Connect permission request contract launcher
    private val requestPermissionsLauncher =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { grantedPermissions ->
            lifecycleScope.launch {
                val hasAll = grantedPermissions.containsAll(SupportedPermissions.PERMISSIONS)
                updatePermissionsStatus(grantedPermissions)
                Toast.makeText(
                    this@MainActivity,
                    if (hasAll) "All health permissions granted!" else "${grantedPermissions.size} permissions granted.",
                    Toast.LENGTH_SHORT
                ).show()

                // If paired, push updated consent to backend
                if (prefs.isPaired) {
                    syncConsentsToBackend(grantedPermissions)
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = AppPreferences(this)
        healthManager = HealthConnectManager(this)

        initUI()
        checkHealthConnectStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun initUI() {
        binding.editServerUrl.setText(prefs.serverUrl)

        binding.btnPairDevice.setOnClickListener {
            val code = binding.editPairCode.text?.toString()?.trim() ?: ""
            if (code.length != 6) {
                Toast.makeText(this, "Please enter a valid 6-digit code.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val server = binding.editServerUrl.text?.toString()?.trim() ?: ""
            if (server.isNotBlank()) {
                prefs.serverUrl = server
            }
            pairDevice(code)
        }

        binding.btnRequestPermissions.setOnClickListener {
            if (healthManager.isSdkAvailable()) {
                requestPermissionsLauncher.launch(SupportedPermissions.PERMISSIONS)
            } else {
                Toast.makeText(this, "Google Health Connect is not available on this device.", Toast.LENGTH_LONG).show()
            }
        }

        binding.btnSyncNow.setOnClickListener {
            if (!prefs.isPaired) {
                Toast.makeText(this, "Please pair your device first.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            manualSync()
        }

        refreshStatus()
    }

    private fun checkHealthConnectStatus() {
        val status = healthManager.getSdkStatus()
        when (status) {
            HealthConnectClient.SDK_AVAILABLE -> {
                binding.textHealthConnectStatus.text = "Health Connect: Available on this device"
                binding.textHealthConnectStatus.setTextColor(getColor(R.color.teal_700))
                binding.btnRequestPermissions.isEnabled = true
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                binding.textHealthConnectStatus.text = "Health Connect: Update required via Google Play"
                binding.textHealthConnectStatus.setTextColor(getColor(R.color.amber_500))
            }
            else -> {
                binding.textHealthConnectStatus.text = "Health Connect: Unavailable on this device"
                binding.textHealthConnectStatus.setTextColor(getColor(android.R.color.holo_red_dark))
                binding.btnRequestPermissions.isEnabled = false
            }
        }
    }

    private fun refreshStatus() {
        if (prefs.isPaired) {
            binding.textPairStatus.text = "Status: Paired & Connected"
            binding.textPairStatus.setTextColor(getColor(R.color.teal_700))
            binding.btnPairDevice.text = "Device Paired"
            binding.btnPairDevice.isEnabled = false
        } else {
            binding.textPairStatus.text = "Status: Not Paired"
            binding.textPairStatus.setTextColor(getColor(android.R.color.holo_red_dark))
            binding.btnPairDevice.text = "Pair With Website"
            binding.btnPairDevice.isEnabled = true
        }

        val lastSync = prefs.lastSyncTimestamp
        binding.textLastSync.text = if (lastSync != null) "Last Synced: $lastSync" else "Last Synced: Never"

        lifecycleScope.launch {
            if (healthManager.isSdkAvailable()) {
                val granted = healthManager.getGrantedPermissions()
                updatePermissionsStatus(granted)
            }
        }
    }

    private fun updatePermissionsStatus(granted: Set<String>) {
        if (granted.isEmpty()) {
            binding.btnRequestPermissions.text = "Grant Health Permissions (0 granted)"
        } else if (granted.containsAll(SupportedPermissions.PERMISSIONS)) {
            binding.btnRequestPermissions.text = "All Health Permissions Granted"
        } else {
            binding.btnRequestPermissions.text = "Health Permissions: ${granted.size}/${SupportedPermissions.PERMISSIONS.size} granted"
        }
    }

    private fun pairDevice(code: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnPairDevice.isEnabled = false

        lifecycleScope.launch {
            try {
                val retrofit = createRetrofit(prefs.serverUrl)
                val api = retrofit.create(SightLinkHealthApi::class.java)

                val req = RegisterDeviceRequest(
                    pairingCode = code,
                    deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
                    deviceModel = Build.MODEL,
                    osVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
                    appVersion = "1.0.0"
                )

                val res = withContext(Dispatchers.IO) { api.registerDevice(req) }
                if (res.isSuccessful && res.body() != null) {
                    val body = res.body()!!
                    prefs.deviceToken = body.deviceToken
                    prefs.deviceId = body.deviceId
                    prefs.userId = body.userId

                    Toast.makeText(this@MainActivity, "Device paired successfully!", Toast.LENGTH_LONG).show()
                    SyncScheduler.schedulePeriodicSync(this@MainActivity, 30)
                    refreshStatus()

                    // Automatically trigger first sync
                    manualSync()
                } else {
                    val err = res.errorBody()?.string() ?: "Pairing failed"
                    Toast.makeText(this@MainActivity, "Pairing error: $err", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Connection failed: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.btnPairDevice.isEnabled = !prefs.isPaired
            }
        }
    }

    private fun manualSync() {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnSyncNow.isEnabled = false

        lifecycleScope.launch {
            try {
                SyncScheduler.triggerImmediateSync(this@MainActivity)
                Toast.makeText(this@MainActivity, "Sync initiated in background.", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Sync error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.btnSyncNow.isEnabled = true
            }
        }
    }

    private suspend fun syncConsentsToBackend(granted: Set<String>) {
        val token = prefs.deviceToken ?: return
        withContext(Dispatchers.IO) {
            try {
                val retrofit = createRetrofit(prefs.serverUrl)
                val api = retrofit.create(SightLinkHealthApi::class.java)

                val items = SupportedPermissions.PERMISSIONS.map { perm ->
                    val shortName = perm.substringAfterLast('.')
                    HealthConsentItem(
                        permissionName = shortName,
                        granted = granted.contains(perm)
                    )
                }

                api.updateConsents(token, UpdateConsentsRequest(deviceToken = token, consents = items))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun createRetrofit(baseUrl: String): Retrofit {
        val cleanUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        val okHttp = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(cleanUrl)
            .client(okHttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}

